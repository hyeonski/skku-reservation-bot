/**
 * GET /spaces — 인원 기반 후보 공간 조회 (D-022, D-024).
 *
 * 쿼리: ListSpacesQuery (headcount 필수, campus/building 선택)
 * 응답: SpaceDto[]
 *
 * 필터:
 * - capacityMin <= headcount <= capacityMax
 * - active = true
 * - campusCode/buildingNo가 주어지면 추가 매칭
 * - building/space가 주어지면 표시명 contains 매칭
 * - space가 GLS 공간코드 형태이면 glsSpaceCode exact 매칭
 *
 * 정렬:
 * - 완료 예약 이력 기반 개인화 점수 내림차순
 * - 그 다음 capacityMax 오름차순 (인원에 가까운 공간 우선 — 공간 효율, D-013)
 *
 * [보류된 기능: 사용자 소속(학과) 기반 우선 정렬]
 * Space.useJojikCode/useJojikName(그 공간을 우선 사용할 수 있는 학과/행정실)은
 * GLS에서 긁어와 DB에 남아 있다. 한때 요청의 userOrgCode와 useJojikCode를 비교해
 * 본인 학과 전용 공간을 맨 앞으로 올리는 isUserOrgPreferred 정렬이 있었으나,
 * 클라이언트가 userOrgCode를 실제로 채워 보낸 적이 없어(항상 비활성) 제거했다.
 * 되살리려면: ① 사용자 소속 코드 확보(GLS 로그인 정보/온보딩 입력/신청서 추론) →
 * ② ListSpacesQuery.userOrgCode 재도입 → ③ useJojikCode 일치 항목 우선 정렬.
 */

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  RECENT_COMPLETED_CONVERSATION_LIMIT,
  RECENT_SPACE_FEEDBACK_EVENT_DAYS,
  RECENT_SPACE_FEEDBACK_EVENT_LIMIT,
  sortSpacesByPersonalizedHistory,
} from '../application/spacePersonalization.js';
import { getGeneralSmallHeadcountCapacityMax } from '../application/spaceSizing.js';
import { ListSpacesQuery, SpaceDto } from '../schemas/space.js';

/**
 * 후보 상한.
 * P1 은 시리얼 후보 순회(사용자에게 하나씩 제시)이므로, 너무 많은 후보를 내려보내도
 * 실제로 소비되지 않는다. 50개면 캠퍼스·건물 미지정 케이스의 worst case 도 충분히 커버.
 */
const MAX_RESULTS = 50;

export async function spacesRoute(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/spaces',
    {
      schema: {
        querystring: ListSpacesQuery,
        response: {
          200: z.array(SpaceDto),
        },
      },
    },
    async (req) => {
      const {
        headcount,
        campusCode,
        buildingNo,
        building,
        space,
        date,
        startTime,
      } = req.query;
      const normalizedSpace = space?.trim().replace(/\s+/g, '').replace(/호$/, '');
      const spaceCodeFilter =
        normalizedSpace && /^[0-9A-Za-z]{5,8}$/.test(normalizedSpace)
          ? normalizedSpace
          : null;
      const smallHeadcountCapacityMax = getGeneralSmallHeadcountCapacityMax({
        headcount,
        hasExplicitLocation: Boolean(buildingNo || building || space),
      });

      const rows = await app.prisma.space.findMany({
        where: {
          active: true,
          capacityMin: { lte: headcount },
          capacityMax: {
            gte: headcount,
            ...(smallHeadcountCapacityMax != null ? { lte: smallHeadcountCapacityMax } : {}),
          },
          ...(campusCode ? { campusCode } : {}),
          ...(buildingNo ? { buildingNo } : {}),
          ...(building ? { buildingName: { contains: building } } : {}),
          ...(spaceCodeFilter
            ? { glsSpaceCode: spaceCodeFilter }
            : space
              ? { roomName: { contains: space } }
              : {}),
        },
        // DB 단에서는 capacityMax 오름차순으로 정렬해두고,
        // userOrg/개인화 우선순위는 메모리에서 안정 정렬로 처리한다.
        orderBy: { capacityMax: 'asc' },
      });

      const dtos = rows.map((row) => ({
        glsSpaceCode: row.glsSpaceCode,
        campusCode: row.campusCode,
        buildingNo: row.buildingNo,
        campusName: row.campusName,
        buildingName: row.buildingName,
        roomName: row.roomName,
        capacityMin: row.capacityMin,
        capacityMax: row.capacityMax,
        useJojikName: row.useJojikName,
        contents: row.contents,
        limitTimeHHMM: row.limitTimeHHMM,
        personalizationReason: null,
      }));

      // 완료 예약 이력은 ReservationRecord(정제된 평면 행)에서 직접 읽는다.
      // reminder 패턴 감지와 동일한 단일 데이터원 — Conversation JSON 파싱 불필요.
      const completedRows = await app.prisma.reservationRecord.findMany({
        where: {
          clientId: req.clientId,
          spaceCode: { not: null },
        },
        orderBy: { reservedAt: 'desc' },
        take: RECENT_COMPLETED_CONVERSATION_LIMIT,
        select: {
          spaceCode: true,
          date: true,
          startTime: true,
        },
      });
      const feedbackCutoff = new Date(
        Date.now() - RECENT_SPACE_FEEDBACK_EVENT_DAYS * 24 * 60 * 60 * 1000,
      );
      const softRejectRows = await app.prisma.spaceFeedbackEvent.findMany({
        where: {
          clientId: req.clientId,
          eventType: 'rejected_candidate',
          createdAt: { gte: feedbackCutoff },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_SPACE_FEEDBACK_EVENT_LIMIT,
        select: {
          spaceCode: true,
          date: true,
          startTime: true,
          createdAt: true,
        },
      });

      const confirmedSpaceCodes = [
        ...new Set(
          completedRows
            .map((row) => row.spaceCode)
            .filter((code): code is string => code != null && code.trim().length > 0),
        ),
      ];
      const confirmedSpaces = confirmedSpaceCodes.length > 0
        ? await app.prisma.space.findMany({
            where: { glsSpaceCode: { in: confirmedSpaceCodes } },
            select: {
              glsSpaceCode: true,
              buildingNo: true,
              buildingName: true,
            },
          })
        : [];
      const confirmedSpaceByCode = new Map(
        confirmedSpaces.map((row) => [row.glsSpaceCode, row]),
      );

      const personalized = sortSpacesByPersonalizedHistory(
        dtos,
        completedRows.flatMap((row) => {
          if (!row.spaceCode) return [];
          const confirmedSpace = confirmedSpaceByCode.get(row.spaceCode);
          return [{
            confirmedSpaceCode: row.spaceCode,
            confirmedBuildingNo: confirmedSpace?.buildingNo ?? null,
            confirmedBuildingName: confirmedSpace?.buildingName ?? null,
            date: row.date,
            startTime: row.startTime,
          }];
        }),
        softRejectRows,
        { date, startTime },
      );

      return personalized.slice(0, MAX_RESULTS);
    },
  );
}
