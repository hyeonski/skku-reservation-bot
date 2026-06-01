import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applicationLengthIssueMessage,
  findApplicationLengthIssue,
  hasRepeatReservationCondition,
} from './chatSafety';

test('repeat reservation guard accepts ordinary repeated wording in application purpose', () => {
  assert.equal(
    hasRepeatReservationCondition(
      '사용목적은 기능 검증을 위해 매우 긴 설명을 붙여넣는 테스트입니다. 반복 설명 반복 설명으로 해줘',
    ),
    false,
  );
});

test('repeat reservation guard rejects explicit recurring reservation requests', () => {
  assert.equal(hasRepeatReservationCondition('매주 화요일 오후 6시에 반복 예약해줘'), true);
  assert.equal(hasRepeatReservationCondition('정기 예약으로 잡아줘'), true);
  assert.equal(hasRepeatReservationCondition('이번 달 매주 금요일마다 공간을 빌리고 싶어'), true);
});

test('application length guard flags overlong event names', () => {
  const issue = findApplicationLengthIssue({
    organization: '기능검증팀',
    eventName: 'E2E 길이 제한 테스트 회의 초과길이 초과길이 초과길이 초과길이 초과길이 초과길이 초과길이',
    purpose: '기능 검증',
    headcount: 10,
    hangsaGbCode: '113',
  });

  assert.deepEqual(issue, {
    field: 'eventName',
    label: '행사명',
    max: 50,
    actual: 51,
  });
  assert.match(applicationLengthIssueMessage(issue), /50자 이내/);
});
