/**
 * /spaces 라우트 Zod 스키마 (D-022, D-024).
 */

import { z } from 'zod';

export const ListSpacesQuery = z.object({
  headcount: z.coerce.number().int().positive(),
  campusCode: z.string().optional(),
  buildingNo: z.string().optional(),
  building: z.string().optional(),
  space: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
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
  personalizationReason: z.string().nullable().optional(),
});
export type SpaceDto = z.infer<typeof SpaceDto>;
