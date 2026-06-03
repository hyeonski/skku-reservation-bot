import { z } from 'zod';

export const ReminderStatus = z.enum(['active', 'dismissed', 'accepted']);
export type ReminderStatus = z.infer<typeof ReminderStatus>;

export const ReminderDto = z.object({
  id: z.string().uuid(),
  status: ReminderStatus,
  title: z.string(),
  pattern: z.string(),
  proposed: z.object({
    date: z.string(),
    time: z.string(),
    space: z.string(),
    spaceCode: z.string().nullable(),
    group: z.string(),
    event: z.string(),
    prompt: z.string(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReminderDto = z.infer<typeof ReminderDto>;

export const ReminderResponse = ReminderDto.nullable();
export type ReminderResponse = z.infer<typeof ReminderResponse>;
