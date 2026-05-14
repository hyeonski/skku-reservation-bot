/**
 * /spaces 라우트 Zod 스키마 (D-022, D-024).
 */

import { z } from 'zod';

export const ListSpacesQuery = z.object({
  headcount: z.coerce.number().int().positive(),
  campusCode: z.string().optional(),
  buildingNo: z.string().optional(),
  userOrgCode: z.string().optional(), // 사용자 소속 — useJojikCode 매칭 우선
});
export type ListSpacesQuery = z.infer<typeof ListSpacesQuery>;

export const SpaceDto = z.object({
  glsSpaceCode: z.string(),
  campusCode: z.string(),
  buildingNo: z.string(),
  campusName: z.string(),
  buildingName: z.string(),
  roomName: z.string(),
  capacityMin: z.number(),
  capacityMax: z.number(),
  useJojikName: z.string().nullable(),
  contents: z.string().nullable(),
  limitTimeHHMM: z.string().nullable(),
  isUserOrgPreferred: z.boolean(), // userOrgCode 일치 여부
});
export type SpaceDto = z.infer<typeof SpaceDto>;
