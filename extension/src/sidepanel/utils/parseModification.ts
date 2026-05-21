import type { ReservationFormData } from '../../shared/types';

export type DraftCommand =
  | { intent: 'submit' }
  | { intent: 'cancel' }
  | { intent: 'alternative' }
  | {
      intent: 'edit';
      field: 'event' | 'group' | 'purpose' | 'headcount';
      value: string;
    }
  | { intent: 'unknown' };

export function parseModification(text: string): DraftCommand {
  const t = text.trim();
  if (/^(제출|예약|신청|보내|진행)/.test(t)) return { intent: 'submit' };
  if (/취소|그만/.test(t)) return { intent: 'cancel' };
  if (/다른\s*(공간|곳)|대안/.test(t)) return { intent: 'alternative' };

  const eventMatch = t.match(
    /행사명[은을]?\s*["']?(.+?)["']?(으로|로|입니다|이에요|예요|으로 바꿔|로 바꿔|$)/,
  );
  if (eventMatch) {
    return { intent: 'edit', field: 'event', value: eventMatch[1].trim() };
  }

  const groupMatch = t.match(
    /(주관)?단체[는은을]?\s*["']?(.+?)["']?(으로|로|입니다|이에요|예요|으로 바꿔|로 바꿔|$)/,
  );
  if (groupMatch) {
    return { intent: 'edit', field: 'group', value: groupMatch[2].trim() };
  }

  const purposeMatch = t.match(
    /(사용)?목적[은을]?\s*["']?(.+?)["']?(으로|로|입니다|이에요|예요|으로 바꿔|로 바꿔|$)/,
  );
  if (purposeMatch) {
    return { intent: 'edit', field: 'purpose', value: purposeMatch[2].trim() };
  }

  const countMatch = t.match(/(?:행사\s*)?인원[은을]?\s*(\d+)\s*명/);
  if (countMatch) {
    return { intent: 'edit', field: 'headcount', value: `${countMatch[1]}명` };
  }

  const bareCountMatch = t.match(/(\d+)\s*명으로?\s*바꿔?/);
  if (bareCountMatch) {
    return { intent: 'edit', field: 'headcount', value: `${bareCountMatch[1]}명` };
  }

  return { intent: 'unknown' };
}

export function applyDraftModification(
  draft: ReservationFormData,
  command: DraftCommand,
): ReservationFormData | null {
  if (command.intent !== 'edit') return null;

  switch (command.field) {
    case 'event':
      return { ...draft, eventName: command.value };
    case 'group':
      return { ...draft, organization: command.value };
    case 'purpose':
      return { ...draft, purpose: command.value };
    case 'headcount': {
      const parsed = Number.parseInt(command.value.replace(/\D/g, ''), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return { ...draft, headcount: parsed };
    }
    default:
      return null;
  }
}
