/**
 * GET /spaces — 인원 기반 후보 공간 조회 (D-022, D-024).
 *
 * 쿼리: ListSpacesQuery (headcount 필수, campus/building/userOrg 선택)
 * 응답: SpaceDto[]
 *
 * 필터:
 * - capacityMin <= headcount <= capacityMax
 * - active = true
 * - campusCode/buildingNo가 주어지면 추가 매칭
 * - building/space가 주어지면 표시명 contains 매칭
 *
 * 정렬:
 * - userOrgCode가 주어지면 useJojikCode 일치 항목 우선 (isUserOrgPreferred=true 먼저)
 * - 그 다음 capacityMax 오름차순 (인원에 가까운 공간 우선 — 공간 효율, D-013)
 */

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

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
      const { headcount, campusCode, buildingNo, building, space, userOrgCode } = req.query;

      const rows = await app.prisma.space.findMany({
        where: {
          active: true,
          capacityMin: { lte: headcount },
          capacityMax: { gte: headcount },
          ...(campusCode ? { campusCode } : {}),
          ...(buildingNo ? { buildingNo } : {}),
          ...(building ? { buildingName: { contains: building } } : {}),
          ...(space ? { roomName: { contains: space } } : {}),
        },
        // DB 단에서는 capacityMax 오름차순으로 정렬해두고,
        // userOrg 우선순위는 메모리에서 안정 정렬로 한 번 더 처리한다.
        orderBy: { capacityMax: 'asc' },
        take: MAX_RESULTS,
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
        isUserOrgPreferred:
          userOrgCode != null && row.useJojikCode === userOrgCode,
      }));

      if (userOrgCode) {
        // 안정 정렬: isUserOrgPreferred=true 를 앞으로. capacityMax 순서는 보존.
        dtos.sort((a, b) => {
          if (a.isUserOrgPreferred === b.isUserOrgPreferred) return 0;
          return a.isUserOrgPreferred ? -1 : 1;
        });
      }

      return dtos;
    },
  );
}
