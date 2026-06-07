import assert from 'node:assert/strict';

import { buildReminderCandidate, type ReminderPatternInput } from '../src/application/reminders.js';

process.env.LLM_API_KEY ??= 'verify-only';
process.env.DATABASE_URL ??= 'mysql://user:password@localhost:3306/verify';

const { __parseRouteTestables } = await import('../src/routes/parse.js');

function input(
  id: string,
  date: string,
  confirmedSpaceLabel: string | null,
  confirmedSpaceCode: string | null,
): ReminderPatternInput {
  return {
    id,
    confirmedSpaceLabel,
    confirmedSpaceCode,
    slots: {
      date,
      start_time: '18:00',
      end_time: '20:00',
      duration_min: 120,
      headcount: 20,
      campus: null,
      building: null,
      space: null,
    },
    formData: {
      hangsaGbCode: '113',
      organization: 'SW학생회',
      eventName: '운영회의',
      headcount: 20,
      purpose: '회의',
    },
  };
}

const repeatedWithCode = buildReminderCandidate(
  [
    input('oldest', '2026-05-04', '반도체관', '111111'),
    input('middle', '2026-05-11', '반도체관', '222222'),
    input('latest', '2026-05-18', '반도체관', '400126'),
  ],
  '2026-05-19',
);

assert.ok(repeatedWithCode, 'three repeated entries create a reminder candidate');
assert.equal(
  repeatedWithCode.spaceCode,
  '400126',
  'candidate uses the latest repeated entry space code',
);
assert.match(
  repeatedWithCode.prompt,
  /공간코드 400126 \(반도체관\)/,
  'label and code prompt includes an explicit room-code phrase without reuse wording',
);
assert.equal(
  __parseRouteTestables.extractExplicitSpaceCode(repeatedWithCode.prompt),
  '400126',
  'parse explicit space code override can extract the reminder prompt code',
);
const repeatedCodeOnly = buildReminderCandidate(
  [
    input('code-only-1', '2026-05-04', null, '111111'),
    input('code-only-2', '2026-05-11', null, '222222'),
    input('code-only-3', '2026-05-18', null, '400126'),
  ],
  '2026-05-19',
);

assert.ok(repeatedCodeOnly, 'space code without label still creates a candidate');
assert.equal(repeatedCodeOnly.spaceLabel, '이전 추천 공간');
assert.equal(repeatedCodeOnly.spaceCode, '400126');
assert.match(
  repeatedCodeOnly.prompt,
  /공간코드 400126/,
  'code-only prompt preserves the explicit space code',
);

const repeatedWithoutCode = buildReminderCandidate(
  [
    input('label-only-1', '2026-05-04', '학생회관 401호', null),
    input('label-only-2', '2026-05-11', '학생회관 401호', null),
    input('label-only-3', '2026-05-18', '학생회관 401호', null),
  ],
  '2026-05-19',
);

assert.ok(repeatedWithoutCode, 'null confirmedSpaceCode still creates a candidate');
assert.equal(repeatedWithoutCode.spaceCode, null);
assert.match(
  repeatedWithoutCode.prompt,
  /희망공간: 학생회관 401호/,
  'label-only prompt keeps the existing fallback phrase',
);

assert.equal(
  buildReminderCandidate(
    [
      input('not-enough-1', '2026-05-04', '반도체관', '400126'),
      input('not-enough-2', '2026-05-11', '반도체관', '400126'),
    ],
    '2026-05-19',
  ),
  null,
  'fewer than three repeated entries do not create a reminder candidate',
);

console.log('reminder space code verification passed');
