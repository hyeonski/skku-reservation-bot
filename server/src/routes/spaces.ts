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
 *
 * 정렬:
 * - userOrgCode가 주어지면 useJojikCode 일치 항목 우선 (isUserOrgPreferred=true 먼저)
 * - 그 다음 capacityMax 오름차순 (인원에 가까운 공간 우선 — 공간 효율)
 *
 * TODO: 구현
 */

import type { FastifyInstance } from 'fastify';

export async function spacesRoute(_app: FastifyInstance): Promise<void> {
  // TODO
}
