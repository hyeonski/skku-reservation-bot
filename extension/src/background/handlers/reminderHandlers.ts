import type { PopupToBackground, ReminderResponse } from '../../shared/messages';
import * as apiClient from '../apiClient';

export async function handleGetReminder(): Promise<ReminderResponse> {
  const reminder = await apiClient.getReminder();
  return { ok: true, reminder };
}

export async function handleDismissReminder(
  msg: Extract<PopupToBackground, { type: 'POPUP_DISMISS_REMINDER' }>,
): Promise<ReminderResponse> {
  const reminder = await apiClient.dismissReminder(msg.reminderId);
  return { ok: true, reminder };
}

export async function handleAcceptReminder(
  msg: Extract<PopupToBackground, { type: 'POPUP_ACCEPT_REMINDER' }>,
): Promise<ReminderResponse> {
  const reminder = await apiClient.acceptReminder(msg.reminderId);
  return { ok: true, reminder };
}
