import type { ReservationFormData } from '../../shared/types';

type DraftEdit = {
  field: 'event' | 'group' | 'purpose' | 'headcount';
  value: string;
};

export type DraftCommand =
  | { intent: 'submit' }
  | { intent: 'cancel' }
  | { intent: 'alternative' }
  | { intent: 'availability_window_unsupported' }
  | { intent: 'edit'; edits: DraftEdit[] }
  | { intent: 'unknown' };

const FIELD_LABEL_PATTERN =
  '(?:행사명|행사\\s*구분|주관\\s*단체|단체|사용\\s*목적|목적|행사\\s*인원|인원)';

function cleanEditValue(value: string): string {
  return value
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.?!。]+$/g, '')
    .replace(/(?:으로|로)?\s*(?:바꾸고|바꿔줘|바꿔주세요|바꿔|변경하고|변경해줘|변경해주세요|변경|수정하고|수정해줘|수정해주세요|수정)\s*$/g, '')
    .replace(/(?:으로|로|입니다|이에요|예요)\s*$/g, '')
    .replace(/\s*(?:그리고|,|;)\s*$/g, '')
    .trim();
}

function extractLabeledEdit(
  text: string,
  labelPattern: string,
  field: DraftEdit['field'],
): DraftEdit | null {
  const match = text.match(
    new RegExp(
      `${labelPattern}(?:만|은|는|을|를)?\\s*[:：]?\\s*["'“”‘’]?(.+?)(?=\\s*(?:그리고|,|;)?\\s*${FIELD_LABEL_PATTERN}(?:만|은|는|을|를)?\\s*[:：]?|$)`,
    ),
  );
  if (!match?.[1]) return null;
  const value = cleanEditValue(match[1]);
  if (!value) return null;
  return { field, value };
}

function isStandaloneAlternativeCommand(text: string): boolean {
  return /^(?:다른\s*(?:공간|곳|후보|방)(?:\s*(?:보여|찾아|찾|추천|줘|주세요|보여줘|찾아줘))?|대안\s*(?:공간|후보)?\s*(?:보여|찾아|찾|추천|줘|주세요|보여줘|찾아줘)|여러\s*개(?:\s*(?:같이|한꺼번에|동시에))?\s*(?:보여|찾아|추천|줘|주세요|보여줘|찾아줘)|비교(?:해줘|해주세요|해|))\s*[.!?。]*$/.test(
    text.trim(),
  );
}

function asksForSpecificRoomAvailabilityWindow(text: string): boolean {
  const normalized = text.trim();
  if (
    !/(언제|몇\s*시|빈\s*(?:시간|날짜|때)|가능한\s*(?:시간|날짜|때)|비어|비는|남는|가용)/.test(
      normalized,
    )
  ) {
    return false;
  }
  return /(?:그|이|해당|원하는)\s*(?:방|공간|곳)|빈\s*시간|언제\s*비어/.test(
    normalized,
  );
}

export function parseModification(text: string): DraftCommand {
  const t = text.trim();
  if (/^(제출|예약|신청|보내|진행)/.test(t)) return { intent: 'submit' };
  if (
    /^(?:이제\s*)?(?:아니(?:요)?[,，]?\s*)?(?:그만(?:할래|할게요?|하자|해|요)?|취소(?:할래|해줘|해주세요|할게요?|하자|요)?|중단(?:할래|해줘|해주세요|할게요?|요)?|중지(?:할래|해줘|해주세요|할게요?|요)?|안\s*할래요?)\s*[.!?。]*$/.test(t)
  ) {
    return { intent: 'cancel' };
  }
  if (asksForSpecificRoomAvailabilityWindow(t)) {
    return { intent: 'availability_window_unsupported' };
  }
  if (isStandaloneAlternativeCommand(t)) {
    return { intent: 'alternative' };
  }

  const edits = [
    extractLabeledEdit(t, '행사명', 'event'),
    extractLabeledEdit(t, '(?:주관\\s*단체|단체)', 'group'),
    extractLabeledEdit(t, '(?:사용\\s*목적|목적)', 'purpose'),
  ].filter((edit): edit is DraftEdit => edit !== null);

  const countMatch = t.match(/(?:행사\s*)?인원[은을는]?\s*(\d+)\s*명/);
  if (countMatch) {
    edits.push({ field: 'headcount', value: `${countMatch[1]}명` });
  }

  const bareCountMatch = t.match(
    /(?:아니(?:요)?\s*)?(\d+)\s*명(?:으로)?\s*(?:(?:바꿔?|변경|수정)(?:해줘|해주세요)?)?$/,
  );
  if (bareCountMatch && !edits.some((edit) => edit.field === 'headcount')) {
    edits.push({ field: 'headcount', value: `${bareCountMatch[1]}명` });
  }

  if (edits.length > 0) return { intent: 'edit', edits };

  const legacyEventMatch = t.match(
    /행사명[은을]?\s*["']?(.+?)["']?(?:으로|로|입니다|이에요|예요|$)/,
  );
  if (legacyEventMatch) {
    const value = cleanEditValue(legacyEventMatch[1]);
    if (value) return { intent: 'edit', edits: [{ field: 'event', value }] };
  }

  const legacyGroupMatch = t.match(
    /(주관)?단체[는은을]?\s*["']?(.+?)["']?(?:으로|로|입니다|이에요|예요|$)/,
  );
  if (legacyGroupMatch) {
    const value = cleanEditValue(legacyGroupMatch[2]);
    if (value) return { intent: 'edit', edits: [{ field: 'group', value }] };
  }

  const legacyPurposeMatch = t.match(
    /(사용)?목적[은을]?\s*["']?(.+?)["']?(?:으로|로|입니다|이에요|예요|$)/,
  );
  if (legacyPurposeMatch) {
    const value = cleanEditValue(legacyPurposeMatch[2]);
    if (value) return { intent: 'edit', edits: [{ field: 'purpose', value }] };
  }

  return { intent: 'unknown' };
}

export function applyDraftModification(
  draft: ReservationFormData,
  command: DraftCommand,
): ReservationFormData | null {
  if (command.intent !== 'edit') return null;

  let next = { ...draft };
  let changed = false;

  for (const edit of command.edits) {
    switch (edit.field) {
      case 'event':
        next = { ...next, eventName: edit.value };
        changed = true;
        break;
      case 'group':
        next = { ...next, organization: edit.value };
        changed = true;
        break;
      case 'purpose':
        next = { ...next, purpose: edit.value };
        changed = true;
        break;
      case 'headcount': {
        const parsed = Number.parseInt(edit.value.replace(/\D/g, ''), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) break;
        next = { ...next, headcount: parsed };
        changed = true;
        break;
      }
      default:
        break;
    }
  }

  return changed ? next : null;
}
