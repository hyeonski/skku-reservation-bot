# SKKU 공간예약 에이전트 E2E Refinement Run - 2026-06-05

> 상태: 진행 중. 오늘 실제 macOS Chrome UI + Computer Use로 핵심 smoke, UC-122 Safety 수정, UC-68/70 timeout 복구 수정, 입력 검증 회귀 묶음, 패널 복원/다른 탭 진행 묶음, 대화 관리 묶음, 지난 신청 재사용/반복 알림 묶음, 반복 알림 수락/dismiss/과거 알림 정리/알림 공간 보존 묶음, 제출 최소정원 guard 묶음, UC-34 실제 저장 성공 판정/UC-115 신청·승인 상태 문구 묶음, UC-40 중복 예약 차단, UC-38 GLS 미리보기 사용자 경로, UC-07 상대 날짜 해석, UC-08 시간 표현 해석, UC-09 건물/캠퍼스 필터, UC-22 조건 미일치 안내, UC-29 행사 정보 누락 질문, UC-30 신청서 항목 말로 수정, UC-31 행사구분 자동 분류, UC-46/48 지난 신청 제안 거절 흐름, UC-95 시설 조건 graceful decline 수정, UC-90 새벽 시간 거절 안내, UC-108 취소/변경 거절, UC-113 반복 예약 거절, UC-117 애매한 행사구분 확인, UC-84/85/133 특정 공간 지정·충돌, UC-96 추천 후 조건 변경 재탐색, UC-88/91 시간·인원 파싱 guard 수정, UC-92 너무 먼 날짜 guard, UC-93 소인원 대형 공간 회피, UC-94 건물 조건 실패 후 범위 확장, UC-86 학생회관 캠퍼스 모호성 guard, UC-87 캠퍼스 별칭, UC-116 장문 신청서 입력 guard, UC-118 빈 기본 연락처 guard, UC-121 제출 직전 재확인과 GLS 신청 가능 상한일 guard, UC-124 특정 방 충돌 graceful decline, UC-127 한글 IME Enter guard, UC-128 긴 붙여넣기 화면 안정성, UC-129 좁은 패널 버튼 접근성, UC-130/131 대화 삭제/기록 숨김, UC-134~145 개인화 추천/추천 이유/Safety/거절 피드백/무공간 반복 알림, UC-67/72 서버 장애 후 입력 보존·재개 흐름, UC-77 전송 연타 방지, UC-105/106 제안 수락·거절 표현을 검증했지만, 최종 목표인 UC-01부터 전체 142개 회귀는 아직 완료되지 않았다.

## 실행 일시와 환경

- 날짜: 2026-06-05
- Timezone: Asia/Seoul
- Workspace: `/Users/hyeonseungkim/workspace/skku-reservation-bot`
- 테스트 문서: `docs/E2E_TEST_CASES.md`
- Extension path: `extension/dist`
- Server target: `localhost:8000`
- Screenshot directory: `/private/tmp/skku-reservation-e2e/2026-06-05/`
- GLS 계정/개인정보: 보고서와 커밋에 기록하지 않음.

## Refinement Iteration 수

- 오늘 제품 수정 iteration: 17.
- 오늘 Computer Use 실행 iteration: 60.
- 기존 2026-06-04 실행은 참고했지만, 오늘 최종 기준 전체 회귀는 아직 미완료다.

## PASS / FAIL / BLOCKED / NOT_RUN

오늘 기준 실제 Computer Use 신규/재검증 결과:

| Result | Count |
| --- | ---: |
| PASS | 111 |
| PARTIAL | 9 |
| FAIL | 0 |
| BLOCKED | 0 |
| NOT_RUN | 22 |

- 오늘 실행 기준 PASS 비율: 111 / 120 = 92.50% (PARTIAL은 PASS로 세지 않음).
- 전체 142개 기준 PASS 비율: 아직 최종 산정 불가.
- 최종 기준 PASS 90% 이상 여부: 전체 회귀 미완료라 아직 미달성.

## P0 / Safety

- 오늘 관찰된 P0/Safety 치명 실패: UC-122 자동 GLS 탭 전환.
- 수정 후 UC-122: PASS.
- 오늘 관찰된 오류 복구 실패: 로그인 재개 뒤 후보 검증이 장시간 `검증 1/7` 상태로 남고 사용자에게 timeout 안내가 없었다.
- 수정 후 UC-68/70: PASS.
- 수정 전 관찰된 제출 실패 불명확성: UC-37에서 GLS 최소인원 팝업 이후 side panel이 `submit result unknown (timeout)`만 표시했다.
- 수정 후 UC-37: PASS. 20명/400126 조건은 추천·제출 경로로 가지 않고 `조건에 맞는 공간이 없어요`와 disabled 저장 버튼으로 멈춘다.
- 수정 전 관찰된 성공 저장 오탐: UC-34에서 GLS가 실제 접수 성공 알림과 신청 목록 행을 만들었지만 side panel이 무관한 페이지 문구를 실패로 표시했다.
- 수정 후 UC-34: PASS. GLS `실행되었습니다.` 알림 뒤 side panel이 `신청 저장 완료 · 승인 대기`를 표시하고, 7월 GLS 목록에 테스트 신청 행이 반영됐다.
- UC-115: PASS. 같은 실제 저장 성공 화면에서 side panel은 `신청 저장 완료 · 승인 대기`라고 표시했고, GLS 목록 상태도 `신청`으로 남아 승인 완료처럼 과장하지 않았다.
- UC-40: PASS. 이미 같은 시간대에 접수된 테스트 신청이 있는 조건에서 `조건에 맞는 공간이 없어요`와 disabled `GLS 신청 저장`으로 중복 저장이 차단됐다.
- UC-39/71: PASS. 추천/저장 사이 조건이 stale해진 경우와 같은 시간대 중복 조건에서 제출 직전 재확인/중복 차단이 작동해 잘못된 완료나 중복 저장으로 끝나지 않았다.
- UC-67/72: PASS after fix. 서버가 꺼진 상태에서 보낸 원문 한글 요청은 대화에 그대로 남고, 서버 복구 뒤 신청 메타만 답해도 이전 날짜·시간·인원 조건과 병합되어 신청서 미리보기/탐색 단계로 이어졌다.
- UC-38: PASS. 실제 GLS 신청 팝업에 미리보기 값을 채우되 `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았다.
- UC-86: PASS after fix. `학생회관`만 말한 요청은 명륜/율전 학생회관 확인 질문으로 멈추고, 저장 버튼은 disabled 상태다.
- UC-116: PASS after fix. 장문 행사명/사용목적 입력은 제출 전에 길이 제한 안내로 멈추고 저장 버튼을 노출하지 않는다.
- UC-118: PASS. 실제 GLS 폼에서 연락처를 빈 값으로 만든 뒤 side panel 저장 경로를 실행하자 `GLS 기본 연락처가 비어 있어요...` 안내와 disabled 저장 버튼으로 멈췄고, GLS 저장은 발생하지 않았다.
- UC-63/75: PASS. 명시 확인 전 자동 제출은 없었고, 폼 작성/필수값 문제는 저장 전에 guard 안내와 disabled 저장 버튼으로 멈췄다.
- UC-121: PASS. 실제 GLS seed 저장으로 stale 조건을 만든 뒤 side panel 저장 경로를 실행하자 `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요...` 안내와 disabled 저장 버튼으로 중복 저장을 차단했다.
- UC-121 중 발견한 상한일 mismatch: 수정 전 2026-09-04 추천은 GLS 실제 저장 직전 `예약일은 20260831까지만 가능` 알림으로 거절됐다. 수정 후 같은 날짜 요청은 후보 조회/저장 단계로 진행하지 않고 너무 먼 날짜 안내로 멈춘다.
- UC-124: PASS. 실제 GLS에 이미 예약된 2026-08-31 18:00-20:00, 400126 조건에서 `18:00~20:00 예약`과 `조건에 맞는 공간이 없어요`를 표시했고, 저장/미리보기 버튼은 disabled 상태였다.
- UC-78/85: PASS. 자정 넘김, 최소인원/특정 공간 충돌 같은 GLS/정책 거부 조건에서 이유를 드러내고, 특정 공간이 차 있을 때 말없이 다른 공간으로 바꾸지 않았다.
- UC-130/131: PASS. 제출 전 검토 단계의 테스트 대화는 목록에서 삭제 확인을 거쳐 제거됐고, 저장/예약신청으로 이어지지 않았다.
- UC-136: PARTIAL. 이력 없는 후보 공간 요청에서 조작된 `추천 이유`는 표시되지 않았지만, 실제 추천 완료 카드 전 단계에서 예약 충돌 또는 GLS 후보 검증 timeout으로 멈췄다. 저장 버튼은 disabled 상태였다.
- UC-137: PASS. 이미 seed 예약이 있는 단골 공간 `반도체관 · 첨단강의실`은 `18:00~20:00 예약`으로 표시되어 예약 가능 추천에서 제외됐고, 저장 버튼은 disabled 상태였다.
- UC-139/140: PASS. 같은 슬롯에서 거절 이력이 있는 후보가 최상단으로 독점 추천되지 않았고, 동시에 후보군에서는 제거되지 않았다. 저장 버튼은 disabled 상태였다.
- UC-141: PASS. 400126 거절 이벤트가 있는 상태에서도 강한 완료 이력이 있는 `반도체관 · 첨단강의실`은 같은 요일·시간대 일반 요청에서 첫 후보로 표시됐다.
- UC-142: PARTIAL. 다른 시작 시간에서도 거절 이력 후보가 제거되지는 않았지만, UI가 점수 강도 차이를 노출하지 않아 strict PASS로 세지 않는다. 저장 버튼은 disabled 상태였다.
- UC-145: PASS. 공간 정보가 없는 반복 알림은 `이전 추천 공간` placeholder를 표시했고, 없는 공간명/공간번호를 지어내지 않았다.
- 수정 후 관찰된 P0/Safety 치명 실패: 없음.
- 전체 Safety 23개 전체 회귀: 미완료.

## 실제 예약 신청 여부

- 오늘 실제 저장 시도: 5회. 날짜는 2026-07-17, 2026-07-24, 2026-07-31, 2026-09-04, 2026-08-31로 모두 현재 날짜 2026-06-05 기준 2주 이후다.
- 오늘 성공한 실제 예약 신청: 테스트 신청 3건.
  - 2026-07-24 18:00-20:00, 공간코드 400126, 40명, 사용목적 `E2E 테스트 저장 성공 검증`.
  - 2026-07-31 18:00-20:00, 공간코드 400126, 40명, 사용목적 `E2E 테스트 저장 완료 판정 검증`.
  - 2026-08-31 18:00-20:00, 공간코드 400126, 40명, 사용목적 `E2E 테스트 제출 직전 재확인 seed`.
- 실수 신청 발생 여부: 없음.
- 수정 전 UC-37 확인 중 2026-07-17, 20명 조건으로 `GLS 신청 저장`을 클릭했지만 GLS가 `최소인원 40명` 팝업으로 거절했고, 실제 신청 저장 완료 문구나 완료 대화는 발생하지 않았다.
- 수정 전 UC-34 valid-capacity 확인 중 2026-07-24, 40명 조건은 실제 신청이 접수됐지만 side panel이 실패로 오탐했고, Iteration 13에서 이를 수정했다.
- 수정 후 같은 20명/400126 조건은 `조건에 맞는 공간이 없어요`로 차단되어 저장 버튼이 disabled 상태였다.
- UC-34 valid-capacity 실제 저장 검증은 2026-07-24와 2026-07-31 조건으로만 수행했다.
- UC-38 미리보기 검증은 2026-08-07 조건으로 수행했고, 실제 저장/예약신청은 하지 않았다.
- UC-07 날짜 해석 검증은 2026-06-07, 2026-06-08 조건으로 수행했다. 이 날짜들은 2주 이내이므로 어떤 저장/예약신청 버튼도 클릭하지 않았다.
- UC-08 시간 표현 검증은 2026-06-06 조건으로 수행했다. 이 날짜는 2주 이내이므로 어떤 저장/예약신청 버튼도 클릭하지 않았다.
- UC-09 건물/캠퍼스 필터 검증은 2026-07-08 조건으로 수행했고, 예약 충돌로 저장 버튼이 disabled 상태라 실제 저장/예약신청은 하지 않았다.
- UC-22 조건 미일치 안내는 2026-06-06/2026-07-08 조건의 no-space 화면으로 검증했고, 저장 버튼이 disabled 상태라 실제 저장/예약신청은 하지 않았다.
- UC-29 행사 정보 누락 질문은 2026-08-21 조건으로 수행했고, 저장 버튼이 노출되기 전 질문 상태에서 멈춰 실제 저장/예약신청은 하지 않았다.
- UC-30 신청서 항목 말로 수정은 2026-08-21 조건으로 수행했고, 신청서 초안 카드 갱신만 확인했다. `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- UC-31 행사구분 자동 분류는 2026-08-21 조건의 초안 카드에서 수행했고, `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- UC-46/48 지난 신청 제안/거절 검증은 실제 저장 날짜 없이 side panel 제안 카드와 새 행사 입력 상태만 확인했다.
- UC-95 시설 조건 graceful decline은 2026-08-14 조건 문장으로 수행했지만, 시설 조건 미지원 안내 뒤 저장/예약신청 단계로 진행하지 않았다.
- UC-90 새벽 시간 거절 안내는 2026-08-18 조건 문장으로 수행했지만, 시간대 미지원 안내 뒤 저장/예약신청 단계로 진행하지 않았다.
- UC-108 취소/변경 요청, UC-113 반복 예약 요청, UC-114 영어 요청 재검증, UC-117 애매한 행사구분 요청은 모두 저장/예약신청 단계로 진행하지 않았다.
- UC-84/96/133 특정 공간·공간코드·조건 변경 검증과 UC-13 다른 공간 PARTIAL 검증은 모두 추천/초안 카드까지만 확인했고, 실제 저장/예약신청은 하지 않았다.
- UC-92 너무 먼 날짜 guard 검증은 2027-12-31 조건 문장으로 수행했고, 후보 조회/신청서 초안/저장 단계로 진행하지 않았다.
- UC-93 소인원 공간 추천 검증과 UC-94 건물 조건 실패 후 범위 확장 검증은 추천/초안 카드까지만 확인했고, `GLS 신청 저장`은 클릭하지 않았다.
- UC-116 장문 신청서 입력 guard 검증은 2026-08-29 조건 문장으로 수행했고, 제출 전 길이 제한 안내만 확인했다. 저장 버튼은 노출되지 않았고 실제 저장/예약신청은 하지 않았다.
- UC-118 기본 연락처 guard 검증은 2026-09-03 조건 문장으로 수행했다. GLS 미리보기로 폼을 연 뒤 연락처 필드를 실제 UI에서 임시로 비웠고, side panel 저장 경로가 제출 전 guard로 멈췄다. 실제 GLS `저장` 버튼은 클릭되지 않았고 신청은 접수되지 않았다. 테스트 뒤 연락처 필드는 원래 값으로 복구했다.
- UC-121 진행 중 수정 전 2026-09-04 조건은 GLS `저장` 클릭 직후 `예약일은 20260831까지만 가능` 알림으로 거절되어 실제 신청은 접수되지 않았다.
- UC-121 stale 재확인 검증은 2026-08-31 조건으로 수행했다. GLS seed 저장 1건을 의도적으로 만든 뒤 같은 side panel 추천에서 `GLS 신청 저장`을 눌렀고, 제출 직전 재확인 guard가 충돌을 감지해 중복 저장을 차단했다.
- UC-124 특정 방 충돌 검증은 UC-121 seed 예약이 있는 2026-08-31, 400126 조건으로 수행했다. 저장/예약신청 단계로 진행하지 않았고, 저장/미리보기 버튼은 disabled 상태였다.
- UC-127 한글 IME Enter 검증은 side panel 입력창에서 수행했다. 저장/예약신청 단계로 진행하지 않았다.
- UC-128 긴 붙여넣기 화면 안정성 검증은 2026-08-28 조건으로 수행했고, 추천 카드와 `GLS 신청 저장` 버튼 노출까지만 확인했다. 실제 저장/예약신청은 하지 않았다.
- UC-129 좁은 패널 검증은 UC-128 검토 화면을 최소 폭에 가까운 side panel 상태로 스크롤하며 수행했고, 실제 저장/예약신청은 하지 않았다.
- UC-130/131 삭제/기록 숨김 검증은 같은 UC-128 테스트 대화를 최근 대화 목록에서 삭제해 수행했다. 삭제 전후 모두 `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- UC-134~137 개인화/추천 이유/Safety 검증은 2026-08-28, 2026-07-24, 2026-08-31 조건으로 수행했다. 추천/초안/충돌/timeout 화면까지만 확인했고 `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- UC-139~142 개인화 거절 피드백 검증은 2026-06-25, 2026-08-28 조건으로 수행했다. 2026-06-25는 현재 날짜 2026-06-05 기준 2주 이후였지만, 모든 화면에서 추천/초안/timeout 상태만 확인했고 `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- UC-145 무공간 반복 알림 검증은 2026-07-24 알림 카드 표시만 확인했다. `네, 예약할게요`를 누르지 않았고 저장/예약신청 단계로 진행하지 않았다.
- 실제 저장 가능성이 있는 제출/미리보기/추천 검증에서 저장 버튼을 클릭한 날짜는 모두 2026-07-17, 2026-07-24, 2026-07-31, 2026-09-04, 2026-08-31로, 현재 날짜 2026-06-05 기준 2주 이후다.

## DB 테스트 데이터 조작 내역

| Action | Data | 개인정보 | 영향 UC |
| --- | --- | --- | --- |
| `pnpm seed:e2e-spaces` | 7개 `Codex E2E` 공간 fixture 생성/수정. 400126은 실제 GLS 표시값에 맞춰 `40-120명`으로 보정 | 없음 | 후보 조회, 특정 공간, 공간코드, 개인화/추천, 정기 알림, UC-37 |
| SQL upsert via maintenance script | 현재 테스트 클라이언트에 `Codex E2E 기능 검증 반복 회의` 완료 대화 3건 생성. 실제 GLS 예약 아님. | 없음 | UC-47, UC-49, UC-51 |
| SQL update via local DB client | `Codex E2E 기능 검증 반복 회의` 테스트 reminder 1건의 prompt/status를 새 형식으로 복구. 실제 GLS 예약 아님. | 없음 | UC-52 |
| SQL update via local DB client | 같은 테스트 reminder 1건을 active 상태로 재복구해 dismiss 동작을 검증. 실제 GLS 예약 아님. | 없음 | UC-53 |
| SQL upsert via local DB client | 테스트 reminder 2건 생성/복구: 2026-06-04 과거 active 1건, 2026-07-17 미래 active 1건. `/reminders` 조회 뒤 과거 건은 dismissed, 미래 건만 active로 남음. 실제 GLS 예약 아님. | 없음 | UC-54 |
| SQL update via local DB client | 2026-07-17 테스트 reminder를 active 상태로 재복구해 알림 수락 후 공간 보존 회귀를 재실행. 실제 GLS 예약 아님. | 없음 | UC-144 |
| 보조 DB 조회 via Prisma | 현재 테스트 클라이언트의 `rejected_candidate` fixture 확인: 2026-06-25 19:00 기준 테스트 공간 3건, 2026-08-28 18:00 기준 400126 1건. 생성/수정/삭제 없음. | 없음 | UC-139, UC-140, UC-141, UC-142 |
| SQL upsert via Prisma | `Codex E2E 무공간 반복 회의` active reminder 1건 생성/갱신. `spaceLabel=null`, `spaceCode=null`, 실제 GLS 예약 아님. | 없음 | UC-145 |

- 기존 사용자 데이터 삭제 없음.
- destructive DB 작업 없음.
- schema/migration 변경 없음.
- UC-136 무이력 후보 선정을 위해 보조 DB 조회로 `32425D`, `50304`에 확인된 `confirmed_space_code` 이력이 없음을 확인했다. 데이터 생성/수정/삭제는 하지 않았고, PASS 판정에는 실제 Chrome UI 관찰만 사용했다.
- UC-139~142 거절 피드백 조건 선정을 위해 보조 DB 조회로 현재 테스트 클라이언트의 `rejected_candidate` 이벤트를 확인했다. 이는 fixture 선정 용도이며, PASS/PARTIAL 판정은 실제 Chrome side panel 후보 순서와 버튼 상태 관찰만 사용했다.
- UC-145 무공간 반복 알림 조건 생성을 위해 테스트 전용 reminder 1건을 upsert했다. 기존 사용자 데이터 삭제나 destructive 작업은 없고, PASS 판정은 실제 Chrome side panel 알림 카드 문구만 사용했다.

## Iteration별 기록

### Iteration 1 - 핵심 smoke와 안전 확인

- User action: Chrome 확장 reload, side panel 열기, 새 대화, starter 예시 클릭, GLS 재로그인, 추천/초안 확인, 저장 버튼 미클릭, 채팅 취소, 잡담 입력.
- Result: 추천 공간 `첨단강의실 (400126)`과 신청서 초안이 표시됐다. 저장은 자동으로 실행되지 않았고, 취소 후 진행이 중단됐다.
- Evidence: `00-extension-reloaded.png` ~ `08-out-of-scope-boundary-no-automation-pii-local-only.png`.
- Regression: 없음.

### Iteration 2 - UC-122 Safety 수정

- Root cause: 로그인 만료 후보 검증 중 `glsCoordinator`가 GLS 탭을 자동 active로 전환했다.
- Fix file: `extension/src/background/glsCoordinator.ts`.
- Fix: 로그인 필요 상태에서는 탭을 강제 전환하지 않고 side panel 로그인 카드만 표시하도록 변경.
- Commit: `044484d` (`fix: GLS 로그인 대기 중 탭 강제 전환을 막음`).
- Verification:
  - `pnpm build` in `extension`: PASS.
  - `pnpm build` in `server`: PASS.
  - `pnpm verify` in `server`: PASS.
  - Chrome extension reload: PASS.
  - Computer Use regression: PASS, 확장 탭 selected 유지 및 `GLS 로그인이 필요해요` 카드 표시.
- Evidence: `09-uc122-postfix-login-needed-no-tab-switch.png`.

### Iteration 3 - 후보 검증 장시간 정체 수정

- Root cause: GLS 후보 검증이 content script 내부에서 장시간 응답을 돌려주지 못하면 side panel이 `검증 1/7` 또는 준비 상태로 오래 남았다. background timeout만으로는 사용자가 즉시 이해할 수 있는 오류 상태로 수렴하지 않았다.
- Fix files:
  - `extension/src/content/contentScript.ts`
  - `extension/src/background/glsCoordinator.ts`
  - `extension/src/shared/messages.ts`
- Fix: content script의 `BG_CHECK_AVAILABILITY` 전체를 25초 timeout으로 감싸고, timeout 결과를 `timedOut`으로 background에 전달한다. background는 timeout을 다음 후보로 계속 넘기지 않고 queue를 정리한 뒤 사용자에게 재시도/조건 변경 안내를 표시한다.
- Commit: `5d87c0a` (`fix: GLS 후보 검증 지연을 사용자에게 안내`).
- Verification:
  - `pnpm build` in `extension`: PASS.
  - `pnpm build` in `server`: PASS.
  - `pnpm verify` in `server`: PASS.
  - `git diff --check`: PASS.
  - Chrome extension reload: PASS.
  - Computer Use regression: PASS, 오래 걸린 후보 검증이 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요. 같은 조건으로 다시 시도하거나 날짜/시간을 바꿔주세요.`로 수렴하고 입력창이 다시 활성화됨.
- Evidence: `10-login-button-resumes-search-pii-local-only.png` ~ `14-postfix-timeout-error-visible.png`.

### Iteration 4 - 입력 검증 회귀 묶음

- User action: 실제 Chrome side panel에서 새 대화 생성 후 누락 인원, 조건 수정, 구어체/축약, 말이 안 되는 시간, 비현실적 인원, 너무 긴 시간, 지원하지 않는 분 단위, 오전/오후 누락, 이상한 입력을 순서대로 입력했다.
- Result: 10개 입력 검증/Robustness 케이스가 저장/신청 없이 사용자-facing 안내나 슬롯 질문으로 수렴했다.
- Evidence: `15-uc06-missing-headcount-only.png` ~ `25-uc16-colloquial-abbrev.png`.
- Regression: 없음.
- 실제 저장/예약신청: 없음.

### Iteration 5 - 패널 복원과 다른 탭 진행

- User action: 진행 중 대화에서 side panel을 닫고 toolbar 버튼으로 다시 열었다. 최근 대화 목록에서 직전 대화를 선택해 슬롯 질문 상태가 복원되는지 확인했다. 이후 `2시간` quick reply를 클릭해 탐색을 시작하고, 실제 GLS 탭으로 전환한 상태에서 side panel 상태 변화를 관찰했다.
- Result: 최근 대화 목록과 직전 대화의 슬롯 질문/quick reply가 복원됐다. 다만 UC-44의 엄격한 Given인 `추천까지 받은 상태`는 이번에 재현하지 못해 PARTIAL로 기록한다. 다른 GLS 탭이 selected 상태일 때도 side panel은 `검증 2/7`과 timeout 안내로 갱신되어 말없이 멈추지 않았다.
- Evidence: `26-uc44-partial-close-reopen-state.png` ~ `28-uc45-other-tab-timeout-visible-pii-local-only.png`.
- Regression: 없음.
- 실제 저장/예약신청: 없음.

### Iteration 6 - 여러 예약 관리

- User action: 최근 대화 목록을 열고 제목/미리보기/시간/삭제 버튼을 확인했다. 테스트용 `@@@` 대화를 열어 저장 메시지 복원을 확인했고, `6/26 학생회 회의` 대화로 전환해 대화 내용이 섞이지 않는지 확인했다. 새 대화만 누른 뒤 아무 입력 없이 목록으로 돌아와 빈 대화가 쌓이지 않는지 확인했다.
- Result: 최근 대화 목록, 자동 제목, 지난 대화 복원, 대화 간 분리, 빈 대화 미저장이 실제 side panel 화면에서 확인됐다. UC-59 삭제는 실제 UI 삭제 조작에 해당해 사용자 확인 전이라 실행하지 않았다.
- Evidence: `29-uc56-recent-list-pii-local-only.png` ~ `32-uc57-no-empty-conversation-pii-local-only.png`.
- Regression: 없음.
- 실제 저장/예약신청: 없음.
- DB/데이터 삭제: 없음.

### Iteration 7 - 지난 신청 재사용과 반복 알림

- Initial failure: 새 대화에서 `저번처럼 해줘`를 입력하자 지난 신청 추천이 아니라 새 신청 정보로 오인되어 인원 질문/초안 흐름으로 빠졌다. 메모리 승인 뒤에도 `검토` phase와 제출 hint만 보이고 신청서 미리보기 본문이 보이지 않았다.
- Root cause:
  - Server: 명시적 재사용 신호가 신청서 설명 추출보다 늦게 평가되어 `저번처럼` 문장을 새 신청 설명으로 해석할 수 있었다.
  - Side panel: 완성된 memory draft가 있어도 DraftCard 노출 조건이 `proposedCandidate`에 묶여 있어 후보가 없는 메모리-only 초안은 카드가 생성되지 않았다.
- DB fixture: 현재 테스트 클라이언트에 `Codex E2E 기능 검증 반복 회의` 완료 대화 3건을 upsert했다. 테스트 전용 데이터이며 실제 GLS 예약은 아니다. 개인정보 없음.
- Fix files:
  - `server/src/application/state.ts`
  - `server/scripts/verify-application-memory.ts`
  - `server/package.json`
  - `extension/src/sidepanel/hooks/useChatStateMachine.ts`
  - `extension/src/sidepanel/ChatScene.tsx`
- Commit: `b5652c1` (`fix: 지난 신청 재사용 흐름을 우선 처리`).
- Verification:
  - `pnpm build` in `extension`: PASS.
  - `pnpm build && pnpm verify` in `server`: PASS.
  - `git diff --check`: PASS.
  - 실제 Chrome UI에서 extension reload: PASS, `새로고침 완료` 표시.
  - Computer Use UC-49: `저번처럼 해줘` 후 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?`와 `네, 같게요` 카드 표시.
  - Computer Use UC-47: `네, 같게요` 클릭 후 `신청서 미리보기` 카드에 행사구분, 주관단체, 행사명, 행사인원, 사용목적 표시. 후보 없는 memory-only 상태라 `GLS 신청 저장`은 disabled.
  - Computer Use UC-51: 최근 대화 목록 상단에 `패턴 알림 · PHASE 3`, 다음 금요일 반복 예약 제안, 날짜/시간/공간, `네, 예약할게요`, `나중에` 표시.
- Evidence: `33-uc49-previous-like-request-pii-local-only.png`, `34-uc49-postfix-reuse-suggestion-pii-local-only.png`, `35-uc51-reminder-card-after-memory-fixture.png`, `38-uc49-postfix-card-visible-after-draft-condition.png`, `39-uc47-postfix-draft-card-visible-disabled-submit.png`.
- Regression: 없음.
- 실제 저장/예약신청: 없음.

### Iteration 8 - 반복 알림 수락 prompt

- Initial failure: UC-52에서 `네, 예약할게요`를 누르자 조건 재입력 없이 메시지는 만들어졌지만, prompt가 `날짜/시간/인원/행사명/지난번처럼 공간명 공간코드`를 한 문장으로 구성해 서버가 행사명을 64자로 오인했다. 화면에는 `행사명이 너무 길어요... 50자 이내` 오류가 표시됐다.
- Root cause: reminder accept prompt가 사용자용 자연어와 서버 신청서 추출 입력을 겸하면서, 신청서 필드 경계를 명확히 제공하지 않았다. 최근 수정된 `지난번처럼` 우선 처리와도 충돌할 수 있는 구조였다.
- DB fixture: 테스트용 reminder 1건만 active 상태와 새 prompt로 복구했다. 테스트 전용 데이터이며 실제 GLS 예약은 아니다. 개인정보 없음.
- Fix files:
  - `server/src/application/reminders.ts`
  - `server/scripts/verify-reminder-space-code.ts`
- Commit: `e66595e` (`fix: 반복 알림 수락 prompt를 신청서 필드로 분리`).
- Verification:
  - `pnpm build && pnpm verify` in `server`: PASS.
  - `git diff --check`: PASS.
  - Computer Use UC-52 after fix: `네, 예약할게요` 클릭 후 `공간코드`, `주관단체`, `행사명`, `행사구분`, `사용목적` 명시 필드 prompt가 전송됨.
  - Computer Use UC-52 after login: `추천 공간`, `예약 가능`, `첨단강의실(400126)`, `신청서 미리보기`, `GLS 신청 저장` 확인 버튼 표시. 실제 저장 버튼은 클릭하지 않음.
- Evidence: `40-uc52-reminder-accept-starts-flow.png`, `41-uc52-postfix-reminder-accept-no-long-title.png`, `42-uc52-postfix-reminder-accept-progress-result.png`, `43-uc52-login-resume-after-reminder-accept-pii-local-only.png`, `44-uc52-postfix-confirmation-pii-local-only.png`.
- Regression: 없음.
- 실제 저장/예약신청: 없음.

### Iteration 9 - 반복 알림 dismiss

- User action: 테스트용 reminder 1건을 active 상태로 복구한 뒤, 실제 Chrome side panel 최근 대화 목록 상단의 반복 알림 카드에서 `나중에` 버튼을 클릭했다.
- Result: 반복 알림 카드가 목록에서 사라지고 `진행 중 · 완료된 대화`와 기존 대화 목록만 표시됐다. 같은 화면에서 중복 알림 재노출이나 자동 예약 진행은 관찰되지 않았다.
- Evidence: `45-uc53-dismiss-reminder-pii-local-only.png`.
- Regression: 없음.
- 실제 저장/예약신청: 없음.

### Iteration 10 - 지난 날짜 반복 알림 정리

- User action: 테스트용 reminder로 지난 날짜 2026-06-04와 다가오는 날짜 2026-07-17을 active 상태로 준비한 뒤, 실제 Chrome side panel을 닫고 확장 아이콘으로 다시 열었다.
- Result: 화면에는 `다가오는 Codex E2E 반복 알림`, `2026-07-17`, `18:00–20:00`, `Codex E2E 첨단강의실 400126`만 표시됐다. 지난 날짜 알림 제목/날짜는 표시되지 않았다.
- Supporting DB evidence: 조회 후 과거 테스트 reminder는 `dismissed`, 미래 테스트 reminder는 `active`로 남았다.
- Evidence: `46-uc54-past-reminder-hidden-future-visible-pii-local-only.png`.
- UC-55 note: 별도 임시 Chrome profile을 띄워 first-time client를 검증하려 했지만, Computer Use가 두 번째 Chrome 인스턴스를 primary target으로 잡지 못해 아직 유효 결과로 세지 않았다. 임시 프로세스는 종료했다.
- Regression: 없음.
- 실제 저장/예약신청: 없음.

### Iteration 11 - 알림 공간 보존과 반복 guard 오탐 수정

- Initial failure: UC-144에서 알림의 `네, 예약할게요`를 누르자 `공간코드 400126` prompt가 전송됐지만, `사용목적: E2E 테스트 반복 알림 검증`의 `반복` 단어 때문에 반복 예약 차단 메시지가 표시되고 후보 조회로 이어지지 않았다.
- Root cause: extension background의 반복 예약 safety guard가 구조화된 신청서 필드의 `행사명`/`사용목적`까지 반복 의도 판정 대상으로 삼았다. 단일 날짜·시간이 명시된 reminder prompt도 목적 텍스트 때문에 차단될 수 있었다.
- Fix file: `extension/src/background/chatPolicies.ts`.
- Fix: 반복 예약 guard 입력에서 구조화된 신청서 필드 라인(`주관단체`, `행사명`, `행사구분`, `사용목적`)을 제외한다. 첫 줄의 예약 지시문에 `매주`/`반복 예약`이 있으면 기존처럼 차단한다.
- Verification:
  - `pnpm build` in `extension`: PASS.
  - 실제 Chrome `chrome://extensions`에서 extension reload: PASS, `새로고침 완료` 표시.
  - Computer Use UC-143: 반복 알림 카드에 날짜 2026-07-17, 시간 18:00-20:00, 행사 맥락, 공간 `Codex E2E 첨단강의실 400126` 표시.
  - Computer Use UC-144 after fix: `네, 예약할게요` 클릭 후 반복 예약 차단 없이 `빈 공간 찾는 중`, `검증 1/1`, 추천 공간 `첨단강의실 (400126)`, GLS 화면의 `[400126] 첨단강의실`, `GLS 신청 저장` 버튼까지 도달. 실제 저장 버튼은 클릭하지 않음.
- Evidence: `46-uc54-past-reminder-hidden-future-visible-pii-local-only.png`, `47-uc144-postfix-reminder-space-priority-pii-local-only.png`.
- Regression: 없음.
- 실제 저장/예약신청: 없음.

### Iteration 12 - 제출 최소정원 guard와 GLS 실패 표시

- Initial failure: UC-34/37 확인 중 실제 Chrome side panel에서 `GLS 신청 저장`을 클릭하자, GLS 화면은 `[400126] 첨단강의실 / 40 명 ~ 120 명` 공간에 `행사인원 20명`을 채운 뒤 `최소인원 (40)명` 검증 팝업을 표시했다.
- User-visible failure: side panel은 실제 GLS 사유 대신 `submit result unknown (timeout)`만 표시했다.
- Root cause:
  - E2E 공간 seed가 400126을 `1-120명`으로 넣어 실제 GLS 정원 `40-120명`과 불일치했다.
  - 제출 직전 후보 검증은 가용 시간만 재확인하고 fresh DB 기준 정원 검증을 다시 하지 않았다.
  - `waitForSubmitResult`는 `오류`/`실패` 제목만 찾고, `N:인원 항목 => 최소인원...`처럼 본문만 있는 GLS 검증 팝업을 실패로 읽지 못했다.
- Fix files:
  - `server/scripts/seed-e2e-spaces.ts`
  - `extension/src/shared/spaceCapacity.ts`
  - `extension/src/background/glsCoordinator.ts`
  - `extension/src/background/handlers/reservationHandlers.ts`
  - `extension/src/background/chatSlotCorrections.ts`
  - `extension/src/content/bridgeMainWorld.ts`
  - `extension/src/sidepanel/hooks/useChatStateMachine.ts`
- Fix:
  - 400126 seed fixture를 실제 GLS 표시와 맞춰 `40-120명`으로 보정했다.
  - 후보 검색·사전 주입 후보·제출 직전 경로에서 `capacityMin <= headcount <= capacityMax` 검증을 공유 유틸로 적용했다.
  - 제출 직전에는 `headcount + spaceCode`로 서버 후보를 다시 조회해 stale candidate가 GLS 저장까지 가지 못하게 했다.
  - GLS 저장 결과 대기 중 최소/최대 인원, 필수 입력 등 본문형 검증 팝업을 `GLS 저장 실패: ...`로 반환하게 했다.
  - no-candidate 재시도 칩의 고정 문구 `100명으로 줄여서 다시`를 `인원 조정해서 다시`로 바꿔 최소정원 실패에서도 안전한 문구가 되게 했다.
- Verification:
  - `pnpm build` in `server`: PASS.
  - `pnpm build` in `extension`: PASS.
  - `pnpm seed:e2e-spaces`: PASS, 7개 Codex E2E spaces seeded.
  - 실제 Chrome `chrome://extensions`에서 extension reload: PASS, `새로고침 완료` 표시.
  - Computer Use pre-fix UC-36: 저장 클릭 후 side panel이 `신청 저장 중...`, 입력/전송 disabled 상태로 잠겨 중복 저장을 막는 것을 확인.
  - Computer Use pre-fix UC-37 failure evidence: GLS 최소인원 팝업 이후 side panel이 `submit result unknown (timeout)`만 표시.
  - Computer Use after fix UC-37: 같은 20명/400126 조건으로 `빈 공간 찾는 중` 뒤 `조건에 맞는 공간이 없어요`, `2026-07-17 18:00-20:00, 20명 조건...`, disabled `GLS 신청 저장`을 확인. GLS 저장/예약신청으로 진행되지 않음.
- Evidence: `48-uc36-submit-in-progress-locked-pii-local-only.png`, `49-uc34-submit-fails-min-capacity-pii-local-only.png`, `50-uc34-capacity-guard-no-candidate-pii-local-only.png`.
- Regression:
  - 수정 후 extension reload 직후 기존 active search resume이 `GLS 세션을 확인하고 후보 공간을 불러오는 중이에요`에서 오래 머문 현상이 있어, 테스트 대화는 Computer Use로 `중단` 처리했다. 새 대화/일반 입력 경로는 계속 열려 있었다.
  - UC-34의 성공 저장 케이스는 아직 valid-capacity 조건으로 재실행하지 않았다.
- 실제 저장/예약신청:
  - 성공한 실제 신청 없음.
  - 수정 전 저장 시도는 2026-07-17 조건이었고, GLS 최소인원 검증 팝업으로 거절되어 완료되지 않았다.
  - 수정 후 20명/400126 조건은 저장 버튼 disabled로 차단됐다.

### Iteration 13 - UC-34 실제 저장 성공 판정과 UC-115 상태 문구

- Initial failure: valid-capacity 조건으로 실제 Chrome side panel에서 `GLS 신청 저장`을 클릭하자 GLS는 `실행되었습니다.`와 사후 안내 팝업을 표시했고, 7월 GLS 목록에는 `2026/07/24 18:00 ~ 20:00`, 공간코드 `400126`, 상태 `신청` 행이 생성됐다. 하지만 side panel은 `GLS 저장 실패: 금학기졸업자신청...입력...`처럼 현재 예약 팝업과 무관한 페이지 문구를 실패로 표시했다.
- Root cause:
  - `visibleGlsValidationMessage()`가 현재 열린 popup 범위를 벗어나 페이지 전체 visible text를 검사했다.
  - GLS 메인 화면의 무관한 `...입력...` 문구가 validation pattern `/입력/`에 걸려 성공 저장 결과를 실패로 오염시켰다.
- Fix file:
  - `extension/src/content/bridgeMainWorld.ts`
- Commit: `904c537` (`fix: GLS 저장 성공 알림의 실패 오탐을 막음`).
- Fix:
  - `activePopupContainsText()`를 추가해 `저장되었습니다.`, `신청되었습니다.`, `실행되었습니다.`, `사용일 전일까지 담당자가 확인 후 처리할 예정이며` 같은 성공 문구를 현재 active popup 내부에서 우선 감지한다.
  - validation failure message 수집도 active popup 내부 visible text로 제한해 페이지 전체의 무관한 메뉴/본문 문구를 실패 사유로 쓰지 않는다.
- Verification:
  - `pnpm build` in `extension`: PASS.
  - 실제 Chrome `chrome://extensions`에서 extension reload: PASS, `새로고침 완료` 표시.
  - Computer Use UC-34 after fix: 2026-07-31, 18:00-20:00, 40명, 400126 조건으로 `GLS 신청 저장` 클릭 후 GLS `실행되었습니다.` 알림과 side panel `신청 저장 완료`, `승인 대기`, `신청 저장 완료 · 승인 대기` 표시.
  - Computer Use GLS list verification: 7월 목록에 `2026/07/31 18:00 ~ 20:00`과 `2026/07/24 18:00 ~ 20:00` 두 테스트 신청 행 표시.
  - UC-115 상태 문구 확인: side panel은 승인 완료가 아니라 `승인 대기`로 표시했고, GLS 목록도 상태 `신청`으로 표시해 신청 접수와 학교 승인 완료를 구분했다.
- Evidence: `51-uc34-presubmit-valid-capacity-pii-local-only.png`, `52-uc34-submit-result-success-alert-sidepanel-fail-pii-local-only.png`, `53-uc34-post-save-guidance-sidepanel-fail-pii-local-only.png`, `54-uc34-saved-reservation-list-sidepanel-fail-pii-local-only.png`, `55-uc34-postfix-presubmit-valid-pii-local-only.png`, `56-uc34-postfix-submit-success-sidepanel-complete-pii-local-only.png`, `57-uc34-postfix-saved-list-two-rows-pii-local-only.png`.
- Regression:
  - UC-36: 저장 클릭 후 `신청 저장 중...` 상태와 입력/전송 disabled 상태 유지.
  - UC-37: 이전 iteration의 20명/400126 차단 수정과 충돌 없음.
- 실제 저장/예약신청:
  - 테스트 신청 2건이 실제 GLS에 접수됐다. 둘 다 2026-06-05 기준 2주 이후 날짜이며 테스트 목적 문구를 포함한다.
  - 실수 신청: 없음.

### Iteration 14 - UC-40 같은 시간대 내 예약 중복 차단

- User action: UC-34 회귀로 실제 접수된 2026-07-31, 18:00-20:00, 400126 테스트 신청이 GLS 목록에 표시된 상태에서, 실제 Chrome side panel 새 대화로 같은 날짜·시간·공간 조건을 다시 요청했다.
- Result:
  - side panel은 `검증 1/1`, `✗`, `반도체관 · 첨단강의실 18:00~20:00 예약`을 표시했다.
  - GLS 화면의 예약현황 영역도 같은 시간대 기존 테스트 신청을 `예약`, `18:00~20:00`으로 표시했다.
  - side panel은 `조건에 맞는 공간이 없어요`, `2026-07-31 18:00–20:00, 40명 조건으로 확인했지만 지금은 맞는 공간이 없었습니다.`를 표시했다.
  - `GLS 신청 저장` 버튼은 disabled 상태였다.
- Evidence: `58-uc40-duplicate-own-reservation-blocked-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 15 - UC-38 GLS 신청서 미리보기 사용자 경로

- Initial failure: background/content에는 `POPUP_PREVIEW_RESERVATION`과 실제 GLS form preview fill 경로가 있었지만, side panel 신청서 초안 카드에 사용자가 누를 수 있는 미리보기 버튼이 없었다. UC-38의 사용자 관점 목표인 “실제 신청 화면에 어떻게 채워지는지 보고 돌아오기”를 실제 UI로 실행할 수 없었다.
- Root cause: preview 기능이 message handler와 content automation에만 존재했고 `DraftCard`/conversation hook/action wiring으로 노출되지 않았다.
- Fix files:
  - `extension/src/sidepanel/components/cards/DraftCard.tsx`
  - `extension/src/sidepanel/hooks/useConversation.ts`
  - `extension/src/sidepanel/ChatScene.tsx`
- Fix:
  - 신청서 초안 카드에 `GLS 미리보기` 버튼을 추가했다.
  - 버튼 클릭 시 `POPUP_PREVIEW_RESERVATION`을 보내 실제 GLS 신청 팝업을 저장 없이 채운다.
  - 성공 시 side panel에 `GLS 신청 화면에 미리보기를 채웠어요. 저장 전 내용을 확인해 주세요.` 안내를 추가한다.
- Verification:
  - `pnpm build` in `extension`: PASS.
  - 실제 Chrome `chrome://extensions`에서 extension reload: PASS, `새로고침 완료` 표시.
  - Computer Use UC-38: 실제 side panel 새 대화에서 2026-08-07, 18:00-20:00, 40명, 400126 조건을 입력했다.
  - 화면에서 `추천 공간`, `예약 가능`, `첨단강의실 (400126)`, 활성 `GLS 미리보기` 버튼을 확인했다.
  - `GLS 미리보기`만 클릭했고, 실제 GLS 신청 팝업에 행사구분, 주관단체, 행사명, 행사인원, 예약날짜, 예약시간, 공간, 사용목적이 채워진 것을 확인했다.
  - side panel은 `GLS 신청 화면에 미리보기를 채웠어요. 저장 전 내용을 확인해 주세요.`를 표시했다.
  - GLS `저장`과 side panel `GLS 신청 저장`은 클릭하지 않았고, 2026-08-07 목록에는 `조회된 데이터가 없습니다.`가 표시되어 실제 신청 행이 생기지 않았다.
- Evidence: `59-uc38-preview-button-visible-pii-local-only.png`, `60-uc38-gls-form-filled-no-submit-pii-local-only.png`.
- Commit: `725ad0f` (`feat: GLS 신청서 미리보기 버튼을 연결`).
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 16 - UC-07 상대 날짜 해석

- User action:
  - 실제 Chrome side panel 새 대화에서 `다음 주 월요일 18시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
  - 이어 새 대화에서 `모레 18시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
- Result:
  - 2026-06-05 금요일 기준 `다음 주 월요일` 요청은 side panel 제목 `SK 2026-06-08 날짜 해석 검증 회의`와 GLS 신청 팝업 예약날짜 `2026-06-08`로 반영됐다.
  - `모레` 요청은 side panel 제목 `SK 2026-06-07 모레 날짜 해석 회의`, 추천 카드 날짜 `2026-06-07`, GLS 신청 팝업 예약날짜 `2026-06-07`로 반영됐다.
  - 두 요청 모두 추천/초안 확인까지만 수행했고, 2주 이내 날짜이므로 side panel `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았다.
- Evidence: `61-uc07-next-monday-parsed-2026-06-08-pii-local-only.png`, `62-uc07-day-after-tomorrow-parsed-2026-06-07-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 17 - UC-08 시간 표현 해석

- User action:
  - 실제 Chrome side panel 새 대화에서 `내일 오후 2시부터 4시까지 40명 반도체관 400126호 예약...`을 입력했다.
  - 이어 새 대화에서 `내일 14시부터 2시간 40명 반도체관 400126호 예약...`을 입력했다.
- Result:
  - 2026-06-05 기준 `내일 오후 2시부터 4시까지` 요청은 side panel 결과 카드에 `2026-06-06 14:00-16:00` 조건으로 표시됐다.
  - `내일 14시부터 2시간` 요청도 side panel 제목 `SK 2026-06-06 시간 길이 검증 회의`와 결과 카드 `2026-06-06 14:00-16:00` 조건으로 표시됐다.
  - 두 요청 모두 2026-06-06 조건이므로 2주 이내 날짜 guard에 따라 side panel `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았다.
- Evidence: `63-uc08-from-to-time-parsed-14-16-pii-local-only.png`, `64-uc08-duration-time-parsed-14-16-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 18 - UC-09 건물/캠퍼스 필터

- User action:
  - 실제 Chrome side panel 새 대화에서 `2026년 7월 8일 19시부터 2시간 15명 율전 학생회관 예약...`을 입력했다.
- Result:
  - side panel 제목은 `SK 2026-07-08 건물 필터 검증 회의`로 바뀌었다.
  - 후보 검증은 `학생회관 · 연습실` 1건으로 제한됐고, GLS 본문도 건물 `학생회관`, 공간 후보 `03B08 연습실`만 표시했다.
  - 해당 시간에는 `예약 충돌`로 `조건에 맞는 공간이 없어요`가 표시됐지만, 엉뚱한 캠퍼스/건물 후보로 대체 추천하지 않았다.
  - `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태였고 저장/예약신청은 발생하지 않았다.
- Evidence: `65-uc09-yuljeon-student-center-filtered-conflict-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 19 - UC-22 조건 미일치 안내

- User action:
  - 실제 Chrome side panel에서 2026-06-06 14:00-16:00, 40명, 반도체관 400126 조건과 2026-07-08 19:00-21:00, 15명, 율전 학생회관 조건을 각각 전송했다.
- Result:
  - 두 조건 모두 실제 GLS 검증 뒤 `조건에 맞는 공간이 없어요`를 표시했다.
  - side panel은 확인한 조건과 인원을 함께 보여주고, `인원 조정해서 다시`, `시간대 19-21시로`, `다음 주 같은 요일로` 같은 조건 변경 제안을 표시했다.
  - `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태라 사용자가 없는 공간을 저장할 수 없었다.
  - 무한 로딩이나 침묵, 다른 조건으로의 묵시적 대체 추천은 관찰되지 않았다.
- Evidence: `63-uc08-from-to-time-parsed-14-16-pii-local-only.png`, `64-uc08-duration-time-parsed-14-16-pii-local-only.png`, `65-uc09-yuljeon-student-center-filtered-conflict-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 20 - UC-29 행사 정보 누락 질문

- User action:
  - 실제 Chrome side panel 새 대화에서 행사 설명 없이 `2026년 8월 21일 18시부터 2시간 40명 반도체관 400126호 예약해줘`만 입력했다.
  - 추천 공간이 표시된 뒤 앱의 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?` 질문에서 `다른 행사예요`를 클릭했다.
- Result:
  - 앱은 조건만으로 바로 저장 단계에 가지 않고, 추천 공간 `첨단강의실 (400126)`을 보여준 뒤 행사 정보 보강을 요구했다.
  - `다른 행사예요` 이후 `SW학생회 운영회의`, `동아리 연습`, `학회 세미나` quick reply와 `단체와 행사명을 알려주세요` 입력 상태가 표시됐다.
  - 행사구분/주관단체/행사명/사용목적을 항목별로 따로따로 캐묻지 않고, 한 화면에서 행사 맥락을 입력하게 했다.
  - 저장/예약신청 버튼은 클릭하지 않았고 실제 신청은 발생하지 않았다.
- Evidence: `66-uc29-missing-event-info-single-prompt-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 21 - UC-30 신청서 항목 말로 수정

- User action:
  - UC-29 흐름에서 `다른 행사예요`를 선택한 뒤 `주관단체 Codex E2E, 행사명 신청서 수정 전 회의, 행사구분 세미나/스터디, 사용목적 E2E 테스트 신청서 수정 전 검증`을 입력해 초안을 만들었다.
  - 같은 대화에서 `행사명은 운영위원회 회의로, 주관단체는 총학생회로, 사용목적은 E2E 테스트 신청서 수정 검증으로 바꿔줘`라고 입력했다.
- Result:
  - side panel이 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`를 표시했다.
  - 신청서 미리보기는 주관단체 `총학생회`, 행사명 `운영위원회 회의`, 사용목적 `E2E 테스트 신청서 수정 검증`으로 갱신됐다.
  - 행사구분 `교내단체행사 (세미나/스터디)`, 행사인원 `40명`, 추천 공간 `첨단강의실 (400126)`, 날짜 `2026-08-21`, 시간 `18:00-20:00`은 유지됐다.
  - `GLS 신청 저장`과 GLS `저장`은 클릭하지 않았고 실제 신청은 발생하지 않았다.
- Evidence: `67-uc30-verbal-draft-fields-updated-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 22 - UC-31 행사구분 자동 분류

- Root cause: side panel의 초안 수정 파서가 행사명/주관단체/사용목적/인원만 edit으로 인식하고 `행사구분`은 local draft edit으로 처리하지 않았다. 그 결과 `행사구분은 보충수업으로 바꿔줘`가 서버 일반 파싱 실패 경로로 넘어가 `예약 요청을 해석하는 중 문제가 생겼어요...`를 표시했다.
- Fix files:
  - `extension/src/sidepanel/utils/parseModification.ts`
  - `extension/src/background/handlers/chatHandler.ts`
- Fix: 초안 수정 파서에 `행사구분` edit을 추가하고 학생회/동아리, 세미나/스터디, 보충수업/특강/시험, 학과 주관행사 등 알려진 표현을 GLS 행사구분 코드로 매핑했다. background local edit guard와 confidence 갱신도 행사구분을 허용하도록 맞췄다.
- Commit: `3675651` (`fix: 행사구분 말 수정 분류를 반영`).
- Verification:
  - `pnpm build` in `extension`: PASS.
  - 실제 Chrome `chrome://extensions`에서 extension reload: PASS, `새로고침 완료` 표시.
  - Computer Use pre-fix: `동아리 정기모임`은 `교내단체행사 (학생회/동아리)`로 바뀌었지만, `보충수업`은 해석 오류 메시지로 떨어졌다.
  - Computer Use post-fix: 같은 대화에서 `행사구분은 보충수업으로 바꿔줘`가 `보충수업/특강/시험`으로, `행사구분은 학과 행사로 바꿔줘`가 `학과 주관행사`로 반영됐다.
- Evidence: `68-uc31-category-bosupparse-fails-pii-local-only.png`, `69-uc31-postfix-category-classification-pii-local-only.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 23 - UC-46/48 지난 신청 제안 거절

- User action:
  - 실제 Chrome `chrome://extensions` 화면에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했고 `새로고침 완료` 문구를 확인했다.
  - toolbar의 `SKKU 공간예약` 버튼으로 side panel을 다시 열었다.
  - 새 대화에서 `저번처럼 해줘`를 입력했다.
  - 화면의 지난 신청 제안 카드에서 `다른 행사예요`를 클릭했다.
- Result:
  - side panel은 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?`를 표시했다.
  - 카드에는 `Codex E2E 기능 검증 반복 회의`, `최근 3회 같은 행사로 신청`, `네, 같게요`, `다른 행사예요`가 표시됐다.
  - `다른 행사예요` 클릭 후 앱은 지난 신청 초안을 채우지 않고 `SW학생회 운영회의`, `동아리 연습`, `학회 세미나` quick reply와 `단체와 행사명을 알려주세요` 입력 상태로 돌아갔다.
  - 저장/예약신청 버튼은 노출되지 않았고 실제 신청은 발생하지 않았다.
- Evidence: `73-uc48-reject-previous-like-new-event-prompt.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 24 - UC-95 시설 조건 graceful decline 초안 제거

- Initial failure:
  - `빔프로젝터 있는 곳` 조건을 포함한 요청에서 side panel은 `빔프로젝터, 화이트보드 같은 시설·장비 조건은 아직 GLS에서 자동 확인할 수 없어요...`를 표시했다.
  - 그러나 동시에 disabled `신청서 미리보기` 초안이 남았고, 행사인원이 `1명`으로 잘못 표시됐다.
  - `GLS 신청 저장`과 `GLS 미리보기`는 disabled라 실제 저장 위험은 낮았지만, unsupported 조건을 거절한 화면에서 잘못 파싱된 초안을 함께 보여 사용자 신뢰를 해칠 수 있었다.
- Root cause:
  - `applyChatSafetyOverride`의 unsupported facility 분기가 `ready_to_search`만 false로 바꾸고, 새 대화에서 서버 파싱 결과의 `application_state`를 그대로 유지했다.
- Fix files:
  - `extension/src/background/chatPolicies.ts`
- Fix:
  - 시설·장비 조건 graceful decline에서 이전 신청 상태가 없으면 `emptyApplicationState()`로 되돌려 잘못 파싱된 새 초안이 노출되지 않게 했다.
- Verification:
  - `pnpm build` in `extension`: PASS.
  - 실제 Chrome `chrome://extensions`에서 extension reload: PASS, `새로고침 완료`.
  - Computer Use post-fix: 같은 UC-95 요청이 시설 조건 미지원 안내만 표시하고, 신청서 초안/저장 버튼 없이 새 행사 quick reply와 입력창으로 복구됐다.
- Evidence: `74-uc95-postfix-facility-decline-no-draft.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 25 - UC-90 새벽 시간 거절 안내

- User action:
  - 실제 Chrome side panel 새 대화에서 `2026년 8월 18일 새벽 3시부터 5시까지 20명 기능 검증 회의 예약해줘`를 입력했다.
- Result:
  - side panel은 후보 탐색이나 GLS 자동화로 넘어가지 않고 `새벽이나 심야 시간대는 일반 GLS 공간예약 가능 시간 밖으로 보여요. 예: 09:00부터 22:00 사이처럼 다시 알려주세요.`를 표시했다.
  - 저장/예약신청 버튼은 노출되지 않았고 실제 신청은 발생하지 않았다.
  - 같은 화면에 지난 신청 제안 카드가 함께 노출됐지만, 시간대 안내와 입력 복구가 명확했고 검색/저장은 진행되지 않았다. 이는 잔여 UX 개선 후보로 남긴다.
- Evidence: `75-uc90-early-morning-time-decline-with-memory-suggestion.png`.
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 26 - UC-108/113/117 graceful decline 보강

- User action:
  - 실제 Chrome side panel 새 대화에서 `방금 예약 취소해줘`를 입력했다.
  - 새 대화에서 `다음 달부터 매주 화요일 18시부터 2시간씩 20명 Codex E2E 반복 예약 회의 예약해줘`를 입력했다.
  - 새 대화에서 `2026년 8월 25일 18시부터 2시간 40명 Codex E2E 활동으로 예약해줘. 주관단체 Codex E2E, 행사명 UC117 애매한 활동 검증, 사용목적 E2E 테스트 행사구분 확인`을 입력했다.
  - UC-114는 영어 요청 `book a room tomorrow 3pm for 10 people`로 재검증했다.
- Result:
  - UC-108: side panel은 `이미 저장되거나 제출된 예약의 취소·변경은 이 확장에서 대신 처리하지 않아요. GLS 화면에서 직접 확인해 주세요.`를 표시했다.
  - UC-113: side panel은 `반복 예약은 아직 자동으로 처리하지 않아요. 안전하게 진행하려면 한 번에 하나의 날짜와 시간만 알려주세요.`를 표시했다.
  - UC-117: side panel은 `학생회/동아리 행사에 더 가깝나요, 학과 주관 행사에 더 가깝나요?`라고 확인 질문을 표시했다.
  - UC-114 재검증: side panel은 `현재는 한국어 예약 요청만 안정적으로 처리할 수 있어요. 날짜, 시간, 인원을 한국어로 다시 알려주세요.`를 표시했다.
  - 네 케이스 모두 후보 조회, GLS 자동화, 저장/예약신청 버튼 노출 없이 입력 상태로 멈췄다.
  - UC-108/113 화면에는 지난 신청 제안 카드가 함께 표시됐다. 거절 문구와 자동화 중단은 명확했으므로 PASS로 기록하되, invalid/decline 화면의 memory suggestion 동반은 잔여 UX 개선 후보로 묶는다.
- Evidence:
  - `76-uc108-cancel-change-graceful-decline.png`
  - `77-uc113-repeat-reservation-decline.png`
  - `78-uc117-ambiguous-category-asks-clarification.png`
  - `79-uc114-english-graceful-decline.png`
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: 없음.

### Iteration 27 - 특정 공간 지정과 추천 후 조건 변경

- User action:
  - 새 대화에서 `2026년 8월 26일 18시부터 20시까지 400126 예약해줘. 40명, 주관단체 Codex E2E, 행사명 UC133 공간코드 검증 회의, 행사구분 세미나, 사용목적 E2E 테스트 공간코드 지정`을 입력했다.
  - 같은 대화에서 추천 후 `아 시간은 19시부터로 바꿔줘`를 입력했다.
  - 새 대화에서 `반도체관 400126호 2026년 8월 27일 18시부터 20시까지 40명 예약해줘. 주관단체 Codex E2E, 행사명 UC84 특정 공간 검증 회의, 행사구분 세미나, 사용목적 E2E 테스트 특정 공간 지정`을 입력했다.
  - 새 대화에서 일반 조건 `2026년 8월 28일 18시부터 20시까지 40명 예약해줘...`를 입력한 뒤, 완료 상태의 `다른 공간` quick action을 클릭했다.
- Result:
  - UC-133: 숫자 `400126`은 인원/날짜가 아니라 특정 공간으로 해석됐고, 추천 카드에 `첨단강의실 (400126)`, `반도체관(40동)`, `2026-08-26`, `18:00-20:00`이 표시됐다.
  - UC-96: 추천 뒤 시간 변경 입력에 `조건을 수정했어요. 같은 조건으로 다시 검색할게요.`가 표시됐고, 추천 카드 시간이 `19:00-20:00`으로 갱신됐다.
  - UC-84: `반도체관 400126호` 요청이 `첨단강의실 (400126)` 한 건으로 추천됐고, 다른 공간을 먼저 추천하지 않았다.
  - UC-13: `다른 공간` 입력에 `같은 조건으로 다른 공간을 찾아볼게요.`가 표시되어 조건 유지와 의도 인식은 확인됐다. 다만 같은 조건에서 나머지 후보가 불가/timeout이어서 두 번째 추천으로 전환되지는 못했다. 저장 버튼은 disabled라 실제 신청 위험은 없었다. 결과는 PARTIAL.
- Evidence:
  - `80-uc133-space-code-specific-recommendation.png`
  - `81-uc96-condition-change-researches-latest-time.png`
  - `82-uc84-specific-space-recommendation.png`
  - `83-uc13-other-space-partial-no-second-available.png`
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression:
  - UC-13에서 다른 공간 요청 후 timeout 후보가 남고 저장이 disabled로 수렴했다. 안전상 치명 실패는 아니지만, 후보 전환 성공 경험은 아직 미검증이다.

### Iteration 28 - 30분 단위와 과거 시간 guard 보강

- Root cause:
  - `6시 반부터 8시까지`처럼 `반`을 포함한 시간 범위가 UC-111의 bare-time 안전 guard에 걸려 오전/오후 재입력 안내로 멈췄다.
  - LLM 또는 로컬 guard가 `12명`, `10명`을 놓친 경우 application draft가 기본값 `1명`으로 표시됐다.
  - `오늘 오후 2시`처럼 이미 지난 시간이 신청서 메타 추출에 묻혀 초안 카드로 넘어갔다.
- Fix files:
  - `shared/reservation/slotPolicy.ts`
  - `server/src/routes/parse.ts`
  - `server/src/application/state.ts`
- Fix:
  - `6시 반부터 8시까지` 같은 bare half-hour range만 저녁 범위로 보정하고, 일반 `6시`는 계속 오전/오후 확인 질문을 유지했다.
  - 명시된 `N명`은 LLM 경로와 로컬 guard 경로 모두에서 `filled_slots.headcount`에 반영했다.
  - 과거 날짜/시간과 너무 먼 날짜 guard는 application draft 추출에 묻히지 않도록 guard 상태를 보존했다.
- Commit: `b66aef7` (`fix: 시간 표현과 과거 예약 guard를 보강`).
- Verification:
  - `pnpm build` in `server`: PASS.
  - `pnpm build` in `extension`: PASS.
  - Server restart on `localhost:8000`: PASS.
  - Chrome extension reload via actual `chrome://extensions` UI: PASS.
  - UC-88 post-fix: PARTIAL. 이전 실패 문구는 사라지고 탐색으로 진행됐으며 신청서 초안은 `행사인원 12명`을 표시했다. 다만 GLS 후보 검증이 timeout으로 끝나 추천 카드의 최종 시간 표시는 확보하지 못했다.
  - UC-91 post-fix: PASS. `지난 날짜나 이미 지난 시간으로는 예약할 수 없어요. 오늘 이후의 날짜와 시간을 다시 알려주세요.` 안내만 표시되고 후보 조회/저장 단계로 가지 않았다.
  - UC-111 regression: PASS. `6시부터 8시까지`는 여전히 오전/오후 확인 질문으로 멈췄고, 초안 인원은 `12명`으로 표시됐다.
- Evidence:
  - `84-uc88-half-hour-time-fail-asks-ampm-and-person-count.png`
  - `85-uc91-past-time-fail-draft-created.png`
  - `86-uc88-post-fix-half-hour-progress-headcount-12.png`
  - `87-uc88-post-fix-partial-timeout-after-headcount-fix.png`
  - `88-uc91-post-fix-past-time-pass-no-draft.png`
  - `89-uc111-regression-bare-time-still-asks-ampm-headcount-gap.png`
  - `90-uc111-regression-bare-time-asks-and-headcount-12.png`
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: P0/Safety 회귀 없음.

### Iteration 29 - 너무 먼 날짜 guard 확인

- Root cause: 없음. 기존 너무 먼 날짜 guard가 신청서 초안 우회를 일으키지 않는지 실제 UI로 확인했다.
- Fix files: 없음.
- Commit: `1e7a26d` (`docs: 너무 먼 날짜 guard 검증 결과를 기록`).
- Verification:
  - Computer Use로 실제 Chrome side panel 새 대화에서 `내년 12월 31일 18시부터 20시까지 20명 회의실 예약해줘. 주관단체 Codex E2E, 행사명 UC92 너무 먼 날짜 회의, 행사구분 세미나, 사용목적 E2E 테스트 너무 먼 날짜 안내`를 입력했다.
  - 화면에 `너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.`가 표시됐다.
  - 후보 조회, 신청서 초안, `GLS 신청 저장` 노출, 실제 저장/예약신청은 발생하지 않았다.
- Evidence:
  - `91-uc92-too-far-date-guard-pass.png`
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: P0/Safety 회귀 없음.

### Iteration 30 - 소인원 요청의 대형 공간 회피 확인

- Root cause: 없음. 소인원 요청이 최소정원 40명 이상 공간으로 바로 수렴하지 않는지 실제 UI로 확인했다.
- Fix files: 없음.
- Verification:
  - Computer Use로 실제 Chrome side panel 새 대화에서 `2026년 8월 24일 18시부터 20시까지 2명 회의실 예약해줘. 주관단체 Codex E2E, 행사명 UC93 소규모 회의, 행사구분 세미나, 사용목적 E2E 테스트 최소 인원 검증`을 입력했다.
  - 화면은 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I` 같은 소규모 후보만 다뤘고, 40명 이상 최소정원 공간을 부적절성 설명 없이 추천하지 않았다.
  - 후보 검증은 timeout으로 중단됐지만 `GLS 신청 저장`은 disabled라 실제 저장 위험은 없었다.
- Evidence:
  - `92-uc93-small-headcount-avoids-large-space-pass-timeout-safe.png`
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: P0/Safety 회귀 없음.

### Iteration 31 - 건물 조건 실패 후 범위 확장 안내 보강

- Root cause:
  - 특정 건물/공간 조건으로 no-space가 발생했을 때 side panel은 인원/시간/날짜 조정만 제안했고, UC-94가 요구하는 같은 캠퍼스 전체 확장 선택지를 제공하지 않았다.
  - 사용자가 직접 `같은 캠퍼스 전체로 넓혀줘`라고 말해도 건물/공간 슬롯을 명시적으로 제거하는 경로가 없었다.
- Fix files:
  - `extension/src/sidepanel/ChatScene.tsx`
  - `extension/src/background/handlers/chatHandler.ts`
- Fix:
  - no-space 카드가 건물/공간 조건이 있는 경우 `건물/공간 조건을 빼고 같은 캠퍼스 전체로 넓혀볼 수 있어요.`를 표시하도록 했다.
  - 하단 힌트에 `같은 캠퍼스 전체로 넓혀줘`, `건물 조건 빼고 다시`를 추가했다.
  - 해당 문장을 background에서 감지해 기존 `building`/`space` 슬롯을 지우고 같은 캠퍼스 조건으로 `modify_slot` 재검색하게 했다.
- Commit: `c0dc48d` (`fix: 건물 조건 실패 후 범위 확장 경로를 추가`).
- Verification:
  - `pnpm build` in `extension`: PASS.
  - `pnpm build` in `server`: PASS.
  - Chrome extension reload via actual `chrome://extensions` UI: PASS.
- Evidence:
  - `93-uc94-building-scope-fail-no-broaden-option.png`
- 실제 저장/예약신청: 없음.
- 실수 신청: 없음.
- Regression: P0/Safety 회귀 없음.

### Iteration 32 - UC-94 after-fix 회귀

- Verification:
  - Computer Use로 실제 Chrome side panel 새 대화에서 `율전 학생회관에서 2026년 8월 25일 18시부터 20시까지 80명 회의실 예약해줘...`를 재입력했다.
  - 화면에 `조건에 맞는 공간이 없어요`와 함께 `건물/공간 조건을 빼고 같은 캠퍼스 전체로 넓혀볼 수 있어요.`가 표시됐다.
  - `같은 캠퍼스 전체로 넓혀줘` 버튼이 노출됐다.
  - 버튼을 실제 클릭하자 `건물/공간 조건을 빼고 같은 캠퍼스 전체에서 다시 찾아볼게요.`가 표시되고, 후보가 `반도체관 · 첨단강의실 (400126)`으로 넓어졌다.
  - 저장 버튼은 보였지만 클릭하지 않았다.
- Evidence:
  - `94-uc94-post-fix-building-scope-broaden-pass.png`
- Result:
  - UC-94: PASS after fix.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
  - Regression: P0/Safety 회귀 없음.

### Iteration 33 - UC-86/87 위치 해석 회귀

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에서 `학생회관에서 2026년 8월 26일 18시부터 20시까지 20명...`을 입력했다.
  - 같은 방식으로 `자과캠에서 2026년 8월 27일 18시부터 20시까지 20명...`을 입력했다.
- Observed:
  - UC-86 수정 전 화면은 캠퍼스 확인 질문 없이 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`와 신청서 초안으로 넘어갔다.
  - UC-86 저장 버튼은 disabled였지만, `학생회관` 모호성을 명륜/율전 확인으로 멈추지 않아 기대 결과와 달랐다.
  - UC-87은 `자과캠`을 율전/자연과학캠퍼스 계열 후보(`의학관`, `산학협력센터`, `학생회관`, `제2공학관`)로 해석했다.
  - UC-87 후보 검증은 timeout 안내로 끝났지만 저장 버튼은 disabled였고, 별칭 인식 자체는 올바른 캠퍼스로 수렴했다.
- Evidence:
  - `95-uc86-ambiguous-student-center-fail-no-campus-question.png`
  - `96-uc87-jagwacam-alias-yuljeon-candidates-pass-search-pending.png`
- Result:
  - UC-86: FAIL before fix.
  - UC-87: PASS with residual timeout risk.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 34 - 학생회관 캠퍼스 모호성 guard 보강

- Root cause:
  - 서버에는 `학생회관` + 캠퍼스 없음 guard가 있었지만 LLM이 `building` 슬롯을 비우면 guard가 적용되지 않았다.
  - 실제 확장 background 후처리에서도 신청서 초안 안내가 사용자-facing 응답으로 살아남아, 위치 모호성 확인 질문이 보존되지 않았다.
- Fix files:
  - `server/src/routes/parse.ts`
  - `extension/src/background/handlers/chatHandler.ts`
- Fix:
  - 원문에 `학생회관`이 있고 명륜/율전/자과캠/인사캠 별칭이 없으면, LLM의 `building` 슬롯 여부와 무관하게 `campus`를 missing으로 만들고 검색을 막는다.
  - 확장 background 후처리 단계에서도 동일한 guard를 적용해 `학생회관은 캠퍼스가 헷갈릴 수 있어요...` 질문을 우선 표시하고 추천/자동화 진행을 막는다.
- Commit: `891437c` (`fix: 학생회관 캠퍼스 모호성 확인을 보강`).
- Verification:
  - `pnpm build` in `server`: PASS.
  - `pnpm build` in `extension`: PASS.
  - 실제 `chrome://extensions` UI의 reload 버튼으로 extension/dist를 반영했고, Chrome에 `새로고침 완료`가 표시됐다.

### Iteration 35 - UC-86 after-fix 회귀

- Verification:
  - Computer Use로 실제 Chrome side panel 새 대화에서 같은 UC-86 조건을 재입력했다.
  - 화면에 `학생회관은 캠퍼스가 헷갈릴 수 있어요. 명륜 학생회관인지, 율전/자과캠 학생회관인지 알려주세요.`가 표시됐다.
  - `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태였다.
  - 후보 탐색, GLS 자동화, 실제 저장/예약신청은 발생하지 않았다.
- Evidence:
  - `97-uc86-post-fix-student-center-campus-question-pass.png`
- Result:
  - UC-86: PASS after fix.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
  - Regression: P0/Safety 회귀 없음.

### Iteration 36 - UC-116 장문 신청서 입력 회귀

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에서 2026-08-29, 18:00-20:00, 20명 조건과 긴 `행사명`/`사용목적` 문장을 입력했다.
  - 전송 뒤 화면이 제출 전 길이 제한 안내로 멈추는지, 또는 조용히 잘라서 초안을 만들거나 반복 예약으로 오탐하는지 관찰했다.
- Observed:
  - 수정 전 화면은 `반복 예약은 아직 자동으로 처리하지 않아요. 안전하게 진행하려면 한 번에 하나의 날짜와 시간만 알려주세요.`를 표시했다.
  - 신청서 초안은 행사명 `UC116 매우 긴`, 사용목적 `E2E 테스트 긴`처럼 값이 조용히 잘린 상태로 보였다.
  - `GLS 신청 저장`은 disabled였고 실제 저장/예약신청은 발생하지 않았다.
- Root cause:
  - 신청서 필드 추출 regex가 현재 필드명(`행사명`, `목적`)을 값 내부에서도 종료 라벨로 취급해 장문 값을 중간에서 잘랐다.
  - 반복 예약 정책이 행사명/사용목적 본문 안의 `반복` 표현을 예약 반복 의도로 오탐했다.
- Evidence:
  - `98-uc116-long-event-purpose-fail-silent-truncation.png`
- Result:
  - UC-116: FAIL before fix.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 37 - 장문 신청서 필드 추출과 반복 guard 보강

- Fix files:
  - `server/src/application/state.ts`
  - `extension/src/background/chatPolicies.ts`
- Fix:
  - 명시 신청서 필드 추출 시 현재 필드명은 자기 값의 종료 라벨로 보지 않도록 필드별 stop label을 분리했다.
  - 반복 예약 판정 전 `주관단체`, `행사명`, `행사구분`, `사용목적` 같은 신청서 명시 필드 본문을 제외해 긴 설명 안의 `반복` 단어를 예약 반복 의도로 오탐하지 않게 했다.
- Commit: `9fb9480` (`fix: 장문 신청서 입력 guard를 보강`).
- Verification:
  - `pnpm build` in `server`: PASS.
  - `pnpm build` in `extension`: PASS.
  - 실제 `chrome://extensions` UI의 reload 버튼으로 extension/dist를 반영했고, Chrome에 `새로고침 완료`가 표시됐다.

### Iteration 38 - UC-116 after-fix 회귀

- Verification:
  - Computer Use로 실제 Chrome side panel 새 대화에서 같은 UC-116 장문 조건을 재입력하고 `전송`을 클릭했다.
  - 화면에 `행사명이 너무 길어요. 현재 137자라서 GLS 저장 전에 실패할 수 있어요. 50자 이내로 줄여서 다시 알려주세요.`가 표시됐다.
  - 반복 예약 거절 문구는 표시되지 않았고, 조용한 truncation 초안이나 저장 버튼도 노출되지 않았다.
- Evidence:
  - `99-uc116-post-fix-long-event-purpose-guard-pass.png`
- Result:
  - UC-116: PASS after fix.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
  - Regression: P0/Safety 회귀 없음.

### Iteration 39 - UC-118 빈 기본 연락처 guard

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에서 2026-09-03, 18:00-20:00, 40명, 반도체관 400126 조건을 입력했다.
  - 추천/초안 화면에서 `GLS 미리보기`를 클릭해 실제 GLS 신청 폼을 열었다.
  - 실제 GLS 연락처 입력칸을 마우스/키보드로 선택해 값을 지웠다.
  - GLS 화면의 `저장`은 누르지 않고, side panel의 `GLS 신청 저장`만 클릭해 제출 전 guard를 확인했다.
- Observed:
  - 연락처가 빈 상태에서 side panel은 `GLS 기본 연락처가 비어 있어요. GLS에서 연락처를 먼저 입력한 뒤 다시 시도해 주세요.`를 표시했다.
  - `GLS 신청 저장`과 `GLS 미리보기`는 disabled로 돌아갔다.
  - GLS `저장` 클릭, 신청 완료 팝업, 신청 목록 행 생성은 발생하지 않았다.
  - 테스트 뒤 연락처 필드는 원래 값으로 복구했다.
- Evidence:
  - `100-uc118-contact-guard-precondition-draft-ready-no-save.png`
  - `101-uc118-contact-cleared-before-extension-submit-pii-local-only.png`
  - `102-uc118-contact-empty-guard-pass-no-save-pii-local-only.png`
- Result:
  - UC-118: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
  - Regression: P0/Safety 회귀 없음.

### Iteration 40 - UC-121 진행 중 GLS 신청 가능 상한일 mismatch 발견

- User Flow:
  - Computer Use로 실제 Chrome side panel에서 2026-09-04, 18:00-20:00, 40명, 반도체관 400126 조건을 입력했다.
  - 추천/미리보기를 거쳐 실제 GLS 폼에서 날짜, 시간, 공간, 인원, 테스트 목적 문구를 확인했다.
  - GLS 페이지의 실제 `저장`을 클릭했다.
- Observed:
  - GLS가 `예약일은 (20260831) 까지만 가능 합니다.` 알림으로 저장을 거절했다.
  - 확장은 수정 전 2026-09-04 조건을 추천/저장 단계까지 보냈다.
- Root Cause:
  - shared future booking window가 180일 기준이라 실제 GLS의 2026-08-31 상한과 맞지 않았다.
- Evidence:
  - `103-uc121-stale-precondition-gls-form-ready-pii-local-only.png`
  - `104-uc121-gls-max-date-alert-no-save-pii-local-only.png`
- Result:
  - 실제 저장/예약신청: 없음. GLS 상한일 알림으로 거절됐다.
  - 실수 신청: 없음.

### Iteration 41 - GLS 신청 가능 상한일 guard 보강

- Fix file:
  - `shared/reservation/slotPolicy.ts`
- Fix:
  - 너무 먼 날짜 판정을 180일 기준에서 현재 월 포함 두 달 뒤 말일 기준으로 변경했다.
  - 2026-06-05 기준 신청 가능 상한은 GLS 화면과 같은 2026-08-31로 계산된다.
- Commit: `5ec6353` (`fix: GLS 신청 가능 상한일 guard를 맞춤`).
- Commit root cause/impact: 실제 GLS 상한일보다 늦은 날짜가 추천/저장 경로로 진입하던 Safety 날짜 guard 문제를 UC-92/UC-121 공통 policy에서 수정했다.
- Verification:
  - `pnpm build` in `server`: PASS.
  - `pnpm build` in `extension`: PASS.
  - 실제 Chrome `chrome://extensions` UI에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했고 `새로고침 완료`를 확인했다.
- 영향 UC: UC-92, UC-121, Safety 날짜 guard.

### Iteration 42 - 상한일 guard after-fix 회귀

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에서 같은 2026-09-04, 18:00-20:00, 40명, 400126 조건을 다시 입력했다.
- Observed:
  - 화면에 `너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요. 가까운 날짜로 다시 알려주세요.`가 표시됐다.
  - 후보 조회, 추천 카드, `GLS 신청 저장`, GLS `저장` 단계로 진행하지 않았다.
- Evidence:
  - `105-uc121-max-date-guard-postfix-no-save.png`
- Result:
  - 상한일 guard: PASS after fix.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 43 - UC-121 stale 추천 제출 직전 재확인

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에서 2026-08-31, 18:00-20:00, 40명, 반도체관 400126 조건을 입력했다.
  - 추천 카드에서 `GLS 미리보기`를 클릭해 실제 GLS 폼을 채웠다.
  - 저장 직전 날짜/시간/공간/인원/테스트 목적 문구를 확인하고 GLS 페이지의 실제 `저장`을 클릭해 seed 예약을 만들었다.
  - 같은 side panel 추천의 `GLS 신청 저장`을 클릭해 제출 직전 재확인을 실행했다.
- Observed:
  - side panel이 `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요. (18:00~20:00 예약) 다른 공간이나 시간을 선택해 주세요.`를 표시했다.
  - GLS 예약현황에는 seed 예약 1건만 보였고, side panel의 `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태로 바뀌었다.
- Evidence:
  - `106-uc121-allowed-date-recommendation-ready-no-save.png`
  - `107-uc121-seed-gls-form-ready-before-save-pii-local-only.png`
  - `108-uc121-seed-gls-save-success-pii-local-only.png`
  - `109-uc121-stale-submit-recheck-blocked-no-duplicate-pii-local-only.png`
- Result:
  - UC-121: PASS.
  - 실제 저장/예약신청: 2026-08-31 18:00-20:00, 공간코드 400126, 40명, 사용목적 `E2E 테스트 제출 직전 재확인 seed` seed 1건.
  - 중복 저장: 없음.
  - 실수 신청: 없음.

### Iteration 44 - UC-124 특정 방 충돌 graceful decline

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에서 UC-121 seed 예약이 있는 2026-08-31, 18:00-20:00, 40명, 반도체관 400126 조건을 입력했다.
  - 첫 변형은 `그 방 언제 비어?` 표현을 포함해 빈 시간 자동 스캔 미지원 안내가 나오는지 확인했다.
  - 두 번째 변형은 같은 날짜/시간/공간을 직접 예약해 달라고 요청해 실제 GLS 가용성 확인 결과를 관찰했다.
- Observed:
  - 첫 변형은 `특정 공간의 빈 시간대를 자동으로 훑어 제안하는 기능은 아직 지원하지 않아요...` 안내로 멈췄고, 저장/예약신청 단계로 진행하지 않았다.
  - 두 번째 변형은 실제 GLS 예약현황의 UC-121 seed 행을 근거로 `18:00~20:00 예약`과 `조건에 맞는 공간이 없어요`를 표시했다.
  - `GLS 신청 저장`과 `GLS 미리보기`는 disabled 상태였고, 조용히 다른 방으로 바꾸거나 실제 저장을 시도하지 않았다.
- Evidence:
  - `110-uc124-specific-room-conflict-decline-no-save.png`
  - `111-uc124-specific-room-conflict-pass-no-save-pii-local-only.png`
- Result:
  - UC-124: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 45 - UC-127 한글 IME Enter premature send 수정

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화 입력창을 클릭했다.
  - macOS 입력 소스를 한글로 전환한 뒤 2벌식 키 `e`, `k`를 눌러 `ㄷㅏ` 조합/자모 상태를 만들었다.
  - 조합 확정 의도로 `Return`을 눌렀다.
- Observed before fix:
  - `ㄷㅏ`가 사용자 메시지로 즉시 전송됐고, side panel은 지난 행사 재사용 제안 카드로 넘어갔다.
  - 기대 결과인 “조합 확정 Enter는 먼저 글자 확정만 하고 메시지를 보내지 않는다”를 위반했다.
- Root Cause:
  - `ChatComposer`가 `nativeEvent.isComposing`만 확인했다. 실제 Chrome/macOS 접근성 입력에서는 한글 자모 상태가 이 플래그로 잡히지 않아 Enter가 전송으로 처리됐다.
- Fix:
  - `extension/src/sidepanel/components/ChatComposer.tsx`: composition start/end 상태를 ref로 추적하고, 값 끝이 Hangul Jamo/Compatibility Jamo인 경우 Enter 전송을 막는 guard를 추가했다.
- Commit:
  - `fb5ae90 fix: 한글 조합 Enter 조기 전송을 막음`
- Verification:
  - `pnpm build` in `extension`: PASS.
  - 실제 Chrome `chrome://extensions` UI에서 `SKKU 공간예약 에이전트` reload 버튼을 클릭했고 `새로고침 완료` 문구를 확인했다.
  - 수정 후 같은 `ㄷㅏ` + `Return` 입력은 메시지로 전송되지 않고 입력창에 남았다.
  - 완성된 `다음 주 화요일` 문장을 입력한 뒤 `Return`을 누르자 실제 사용자 메시지로 전송됐다.
- Evidence:
  - `112-uc127-ime-enter-premature-send-fail-pii-local-only.png`
  - `113-uc127-postfix-ime-enter-does-not-send.png`
  - `114-uc127-postfix-complete-text-enter-sends.png`
- Result:
  - UC-127: PASS after fix.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 46 - UC-128 긴 붙여넣기 화면 안정성

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화 입력창을 클릭했다.
  - 2026-08-28 18:00-20:00, 40명, 반도체관 400126 조건과 긴 여러 줄 주관단체/행사명/행사구분/사용목적 문장을 붙여넣었다.
  - 전송 전 입력창 레이아웃과 전송 버튼 위치를 확인한 뒤 `전송` 버튼을 클릭했다.
  - 응답 후 추천 카드, 신청서 미리보기, 긴 사용목적, 하단 `GLS 신청 저장`/`GLS 미리보기`/`수정` 버튼의 배치를 확인했다.
- Observed:
  - 긴 입력은 입력창 내부에서 줄바꿈됐고, 전송 버튼은 오른쪽 하단에 유지됐다.
  - 전송 후 사용자 메시지 버블과 신청서 미리보기의 긴 사용목적은 side panel 너비 안에서 줄바꿈됐다.
  - 탐색 중에는 `빈 공간 찾는 중`, `검증 1/1`, disabled `GLS 신청 저장`/`GLS 미리보기`가 표시됐다.
  - 탐색 완료 뒤 `추천 공간`, `예약 가능`, `첨단강의실 (400126)`, `신청서 미리보기`, `GLS 신청 저장`, `GLS 미리보기`, `수정` 버튼이 화면 안에 유지됐다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Evidence:
  - `115-uc128-long-paste-before-send.png`
  - `116-uc128-long-paste-card-searching-layout.png`
  - `117-uc128-long-paste-final-review-layout-no-save.png`
- Commit:
  - `a52fed7 docs: UC-128 긴 붙여넣기 검증을 기록`
- Result:
  - UC-128: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 47 - UC-129 좁은 사이드패널 버튼 접근성

- User Flow:
  - Computer Use로 실제 Chrome side panel의 크기 조절 핸들을 오른쪽으로 끌어 최소 폭에 가까운 상태를 만들려고 시도했다.
  - Chrome side panel이 현재 폭 근처에서 최소 폭으로 유지되는 것을 확인했다.
  - 같은 좁은 패널 상태에서 UC-128 검토 화면을 위아래로 스크롤했다.
- Observed:
  - 상단에서는 사용자 메시지, `빈 공간 찾는 중` 완료 상태, 추천 공간 `첨단강의실 (400126)` 카드가 화면 안에 유지됐다.
  - 하단에서는 신청서 미리보기의 긴 사용목적과 `GLS 신청 저장`, `GLS 미리보기`, `수정`, `제출`, `행사명만 바꾸기`, `다른 공간` 버튼이 겹치지 않고 접근 가능했다.
  - 버튼이나 긴 텍스트가 서로 겹치거나 화면 밖으로 밀려 실제 클릭 대상을 가리는 현상은 보이지 않았다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Evidence:
  - `118-uc129-narrow-panel-buttons-visible-no-save.png`
  - `119-uc129-narrow-panel-recommendation-accessible.png`
  - `120-uc129-narrow-panel-summary-buttons-accessible-no-save.png`
- Result:
  - UC-129: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 48 - UC-130/131 대화 삭제와 기록 숨김

- User Flow:
  - Computer Use로 실제 Chrome side panel의 `대화 목록`을 열었다.
  - 제출 전 검토 단계에 있던 `UC128 긴 붙여넣기 검증 회의` 대화가 최근 대화 목록 상단에 표시되는 것을 확인했다.
  - 해당 항목의 `대화 삭제` 버튼을 클릭했다.
  - 버튼이 `대화 삭제 확인`, `한 번 더 누르면 삭제` 상태로 바뀐 것을 확인했다.
  - 같은 삭제 버튼을 다시 눌러 실제 삭제를 완료했다.
- Observed:
  - 삭제 전 목록에는 `UC128 긴 붙여넣기 검증 회의` 제목과 `신청 정보를 업데이트했어요...` 미리보기가 보였다.
  - 삭제 확인 단계가 있어 실수 삭제를 막는다.
  - 삭제 완료 후 목록 상단은 `다음 주 화요일` 대화로 바뀌었고, `UC128 긴 붙여넣기 검증 회의` 항목은 더 이상 보이지 않았다.
  - 삭제 과정에서 저장/미리보기/제출 버튼은 누르지 않았고, GLS 저장/예약신청은 발생하지 않았다.
- Evidence:
  - `121-uc130-uc131-before-delete-conversation-visible.png`
  - `122-uc130-delete-confirmation-state.png`
  - `123-uc130-uc131-after-delete-conversation-removed-no-save.png`
- Commit:
  - `e27401e docs: UC-129부터 UC-131 화면 검증을 기록`
- Result:
  - UC-130: PASS. 제출 전 검토 단계 대화를 삭제해 뒤에서 저장으로 진행되지 않음을 확인했다.
  - UC-131: PASS. 삭제 후 목록에서 테스트 단체/행사명이 사라져 다음 사용자가 쉽게 볼 수 없게 됐다.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 49 - UC-134 개인화 후보 우선순위

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에 2026-08-28 18:00-20:00, 40명, 일반 `회의실` 조건과 `UC134 개인화 추천 검증 회의` 테스트 신청 정보를 붙여넣고 전송했다.
  - 후보 조회 카드에서 후보 순서와 timeout 상태를 관찰했다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - 후보 조회 중 `반도체관 · 첨단강의실`, `경영관 · 세미나실4`, `의학관 · 강의실` 순으로 표시됐다.
  - 반복적으로 실제 저장에 성공한 400126 공간이 첫 후보로 올라왔다.
  - 다만 최종 추천 완료 전 `반도체관 · 첨단강의실 검증 시간 초과`와 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 수렴했다.
- Evidence:
  - `124-uc134-uc135-personalized-search-in-progress.png`
  - `125-uc134-personalized-first-candidate-but-timeout-partial.png`
- Result:
  - UC-134: PARTIAL. 개인화 우선 후보 순서는 확인했지만, timeout으로 최종 추천 카드까지 완료되지는 않았다.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 50 - UC-135 추천 이유 표시

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에 2026-08-28 18:00-20:00, 40명, `반도체관 400126호`와 `UC135 추천 이유 검증 회의` 테스트 신청 정보를 붙여넣고 전송했다.
  - 추천 완료 카드의 공간명, 추천 이유, 저장/미리보기 버튼 상태를 관찰했다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - 추천 카드에 `첨단강의실 (400126)`이 표시됐다.
  - 추천 이유 영역에 `최근 같은 요일·시간대 예약에서 4회 사용`이 표시됐다.
  - `GLS 신청 저장`, `GLS 미리보기`, `수정` 버튼은 화면 안에 표시됐지만 클릭하지 않았다.
- Evidence:
  - `126-uc135-recommendation-reason-visible-no-save.png`
- Result:
  - UC-135: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 51 - UC-136 이력 없는 공간 추천 이유 Safety

- User Flow:
  - Computer Use로 실제 Chrome side panel에서 이력 없는 보조 후보 공간을 대상으로 세 차례 재시도했다.
  - 1차: 2026-08-28 18:00-20:00, 40명, `경영관 32425D` 조건.
  - 2차: 2026-08-28 18:00-20:00, 40명, `의학관 50304` 조건. 이 시도는 Computer Use `type_text`가 한글을 보존하지 못해 UC 판정 증거에서 제외했다.
  - 3차: 2026-07-24 10:00-12:00, 40명, `의학관 50304` 조건. 오전/오후 확인 질문에 `오전 10시부터 낮 12시까지로 해줘`라고 답해 후보 검증 단계까지 진행했다.
  - 모든 시도에서 `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - 1차는 `경영관 · 세미나실4 예약 충돌`과 `조건에 맞는 공간이 없어요`로 끝났고, 저장/미리보기 버튼은 disabled였다.
  - 3차는 `의학관 · 강의실 검증 시간 초과`와 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 끝났고, 저장/미리보기 버튼은 disabled였다.
  - 어떤 화면에서도 근거 없는 `추천 이유` 문구는 표시되지 않았다.
- Evidence:
  - `127-uc136-no-history-space-conflict-no-reason-no-save.png`
  - `128-uc136-no-history-space-timeout-no-fabricated-reason-no-save.png`
- Result:
  - UC-136: PARTIAL. 조작된 추천 이유는 없었지만, 최종 추천 카드가 만들어지지 않아 strict PASS로 세지 않는다.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 52 - UC-137 차 있는 단골 공간 회피

- User Flow:
  - UC-121에서 실제 저장한 2026-08-31 18:00-20:00, 400126 seed 신청이 남아 있는 상태에서 Computer Use로 실제 Chrome side panel 새 대화를 열었다.
  - 2026-08-31 18:00-20:00, 40명, 일반 `회의실` 조건과 `UC137 차 있는 단골 회피 검증 회의` 테스트 신청 정보를 붙여넣고 전송했다.
  - 후보 조회 화면에서 400126이 예약 가능 추천으로 살아나는지 확인했다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - 후보 목록에서 `반도체관 · 첨단강의실`은 `18:00~20:00 예약`으로 표시됐다.
  - 이후 `경영관 · 세미나실4`, `의학관 · 강의실` 후보를 검증했지만 timeout 안내로 끝났다.
  - 최종 화면에서 `GLS 신청 저장`과 `GLS 미리보기`는 disabled였고, 차 있는 단골 공간을 예약 가능 카드로 추천하지 않았다.
- Evidence:
  - `129-uc137-favorite-occupied-marked-reserved-searching.png`
  - `130-uc137-occupied-favorite-not-recommended-no-save.png`
- Commit:
  - `d4db642 docs: UC-134부터 UC-137 개인화 검증을 기록`
- Result:
  - UC-137: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 53 - UC-139 거절 피드백 seed 시도

- User Flow:
  - Computer Use로 실제 Chrome side panel 새 대화에 2026-08-28 15:00-16:00, 2명, 일반 `회의실` 조건과 `UC139 거절 반영 seed 회의` 신청 정보를 붙여넣었다.
  - `전송` 버튼을 실제 클릭했다.
  - 후보 조회 화면에서 추천 카드가 만들어지는지 확인했다.
  - timeout 후 quick action `다른 공간`을 실제 클릭해 화면 반응을 확인했다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - 후보 순서에 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I`이 표시됐다.
  - `수선관 · 세미나실`은 `예약 충돌`, `산학협력센터 · 세미나실 I`은 `검증 시간 초과`로 끝났다.
  - 추천 완료 카드가 만들어지지 않아 이 시도만으로는 거절 이벤트 생성/재검색 PASS 근거로 쓰지 않는다.
  - `다른 공간` 클릭 뒤 `같은 조건으로 다른 공간을 찾아볼게요.` 문구가 표시됐지만 새 추천으로 이어지지는 않았다.
- Evidence:
  - `131-uc139-seed-candidates-searching.png`
  - `132-uc139-seed-no-recommendation-timeout.png`
  - `133-uc139-seed-other-space-after-timeout.png`
- Result:
  - UC-139 seed attempt: INCONCLUSIVE. 최종 케이스 결과에는 별도 카운트하지 않는다.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 54 - UC-139/140 거절 후보 재검색과 후보 유지

- User Flow:
  - 보조 DB 조회로 현재 테스트 클라이언트에 2026-06-25 19:00 기준 테스트 공간 `85529`, `26305`, `03B08`의 `rejected_candidate` fixture가 있음을 확인했다. 이는 조건 선정용이며 PASS 판정에는 사용하지 않았다.
  - Computer Use로 실제 Chrome side panel 새 대화에 2026-06-25 19:00-20:00, 2명, 일반 `회의실` 조건과 `UC139 거절 반영 재검색 회의` 신청 정보를 붙여넣었다.
  - `전송` 버튼을 실제 클릭했다.
  - 후보 조회 카드의 후보 순서, timeout 상태, 저장 버튼 상태를 관찰했다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - 후보 순서가 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I`로 표시됐다.
  - 같은 슬롯에서 거절 이력이 있는 `산학협력센터 · 세미나실 I`은 첫 후보로 독점되지 않고 두 번째 후보로 표시됐다.
  - 동시에 거절 이력 후보가 후보군에서 제거되지 않았고 계속 목록에 남았다.
  - 최종 화면은 `수선관 · 세미나실 검증 시간 초과`, `산학협력센터 · 세미나실 I` 및 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 끝났으며, 저장/미리보기 버튼은 disabled였다.
- Evidence:
  - `134-uc139-rejected-spaces-ranked-after-unrejected.png`
  - `135-uc139-final-timeout-but-rejected-still-candidate.png`
- Result:
  - UC-139: PASS. 방금/최근 거절한 후보가 같은 슬롯 재검색에서 최상단으로 다시 독점되지 않았다.
  - UC-140: PASS. 거절한 후보가 후보군에서 제거되지 않고 여전히 표시됐다.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.

### Iteration 55 - UC-141/142 거절 강도와 단골 이력 우선

- User Flow:
  - 보조 DB 조회로 2026-08-28 18:00 기준 400126 `rejected_candidate` 이벤트와 400126 완료 이력 fixture가 공존함을 확인했다. 이는 조건 선정용이며 PASS 판정에는 실제 화면 관찰만 사용했다.
  - UC-134/135에서 이미 Computer Use로 2026-08-28 18:00-20:00, 40명 조건을 실행한 화면을 UC-141 증거로 재사용했다.
  - Computer Use로 실제 Chrome side panel 새 대화에 2026-06-25 20:00-21:00, 2명, 일반 `회의실` 조건과 `UC142 거절 시간대 차이 회의` 신청 정보를 붙여넣었다.
  - `전송` 버튼을 실제 클릭하고 후보 순서, timeout 상태, 저장 버튼 상태를 관찰했다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - UC-141 증거: 같은 클라이언트에 400126 거절 이벤트가 있는 상태에서도 UC-134 일반 `회의실` 화면은 `반도체관 · 첨단강의실`을 첫 후보로 표시했고, UC-135 특정 공간 화면은 `최근 같은 요일·시간대 예약에서 4회 사용` 추천 이유를 표시했다.
  - UC-142 화면은 다른 시작 시간 20:00에서도 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I` 순서를 표시했다.
  - 다른 시간대에서도 거절 이력 후보가 후보군에서 제거되지는 않았지만, UI가 개인화 점수 강도 차이를 노출하지 않아 "약하게만 반영"을 strict하게 화면만으로 증명하지 못했다.
  - 최종 화면은 `GLS 후보 검증이 오래 걸려 자동화를 중단했어요...` 안내로 끝났으며, 저장/미리보기 버튼은 disabled였다.
- Evidence:
  - UC-141: `124-uc134-uc135-personalized-search-in-progress.png`, `125-uc134-personalized-first-candidate-but-timeout-partial.png`, `126-uc135-recommendation-reason-visible-no-save.png`
  - UC-142: `136-uc142-different-time-rejected-candidate-still-present.png`, `137-uc142-final-timeout-different-time.png`
- Result:
  - UC-141: PASS. 강한 완료 이력이 한 번의 거절보다 우선해 단골 공간이 여전히 앞쪽에 보였다.
  - UC-142: PARTIAL. 다른 시간대에서도 거절 후보가 제거되지 않는 것은 확인했지만, UI만으로 같은 시간대 대비 점수 강도 차이를 strict하게 판정할 수 없었다.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
- Commit:
  - `64fe6f9` (`docs: UC-139부터 UC-142 거절 피드백 검증을 기록`)
  - Root cause: 개인화 추천의 거절 피드백 케이스가 실제 Chrome UI 증거와 최종 집계에 반영되지 않았다.
  - 영향 UC: UC-138, UC-139, UC-140, UC-141, UC-142.
  - 검증: `git diff --check` 통과, 개인정보 값 검색에서 GLS 계정/비밀번호 원문 미포함 확인.

### Iteration 56 - UC-145 공간 정보 없는 반복 알림

- User Flow:
  - 보조 DB 조작으로 현재 테스트 클라이언트에 `Codex E2E 무공간 반복 회의` active reminder 1건을 upsert했다.
  - 해당 reminder는 2026-07-24 15:00-16:00, 12명, `Codex E2E`, `UC145 공간 없는 반복 회의` 조건이며 `spaceLabel=null`, `spaceCode=null`이다.
  - Computer Use로 실제 Chrome side panel에서 `대화 목록` 버튼을 클릭해 최근 대화/알림 화면을 열었다.
  - 알림 카드의 날짜, 시간, 공간 placeholder, 버튼 상태를 관찰했다.
  - `네, 예약할게요`, `GLS 신청 저장`, GLS `저장`은 클릭하지 않았다.
- Observed:
  - 알림 카드에 `패턴 알림 · PHASE 3`, `Codex E2E 무공간 반복 회의`, `2026-07-24`, `15:00–16:00`이 표시됐다.
  - 공간 칸에는 실제 공간명/번호가 아니라 `이전 추천 공간`이 표시됐다.
  - 없는 공간을 `400126`이나 다른 공간명으로 지어내지 않았다.
  - `네, 예약할게요`, `나중에` 버튼은 표시됐지만 클릭하지 않았다.
- Evidence:
  - `138-uc145-reminder-without-space-placeholder-pass.png`
- Result:
  - UC-145: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
- Commit:
  - `10d7f32` (`docs: UC-145 무공간 반복 알림 검증을 기록`)
  - Root cause: 공간 정보가 없는 반복 알림 케이스가 실제 Chrome UI 증거와 최종 집계에 반영되지 않았다.
  - 영향 UC: UC-145.
  - 검증: `git diff --check` 통과, UC 결과 표 대조에서 PASS 99 / PARTIAL 9 / NOT_RUN 34 확인, 개인정보 원문 검색에서 GLS 계정/비밀번호 원문 미포함 확인.

### Iteration 57 - 기존 Computer Use 증거로 Safety/오류 케이스 재판정

- User Flow:
  - 새 자동화 도구나 API PASS 판정 없이, 오늘 이미 Computer Use로 관찰한 실제 Chrome side panel/GLS 화면 증거를 문서 기준에 다시 매핑했다.
  - UC-121, UC-40, UC-37, UC-17, UC-118, UC-124, UC-06/73 화면을 재검토했다.
  - 추가 `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았다.
- Observed:
  - UC-39/71: stale 추천/동일 시간대 중복 조건에서 `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요...`, `조건에 맞는 공간이 없어요`와 disabled 저장 버튼이 표시되어 잘못된 완료나 중복 저장으로 끝나지 않았다.
  - UC-63: 실제 저장은 `GLS 신청 저장`을 명시 클릭한 2주 이후 테스트 케이스에서만 발생했고, 추천/제안 단계에서는 자동 신청이 없었다.
  - UC-73: 부족/오류 입력에서 `몇 명이 사용하실 예정인가요?`, `오전 6시 또는 오후 6시처럼`, 조건 변경 제안 같은 다음 행동 안내가 표시됐다.
  - UC-75: 길이 제한, 기본 연락처, 최소인원 등 폼/제출 전 guard가 저장 전에 멈추며, 반쯤 작성된 상태로 GLS 저장을 누르지 않았다.
  - UC-78: 자정 넘김과 최소인원 제한이 사용자-facing 이유로 드러났고, 저장 성공으로 오인되지 않았다.
  - UC-85: 특정 400126이 이미 차 있는 조건에서 `18:00~20:00 예약`, `조건에 맞는 공간이 없어요`를 표시하고 다른 공간으로 조용히 바꾸지 않았다.
- Evidence:
  - UC-39/71: `112-uc121-stale-before-final-save-enabled.png`, `113-uc121-stale-recheck-blocked-no-duplicate.png`, `51-uc40-duplicate-existing-blocked-no-save.png`
  - UC-63: `06-recommendation-draft-save-visible-not-clicked-pii-local-only.png`, `78-uc98-save-visible-no-auto-submit.png`
  - UC-73: `15-uc06-missing-headcount-only.png`, `23-uc111-ambiguous-ampm.png`, `90-uc94-post-fix-building-fail-offers-broaden.png`
  - UC-75: `99-uc116-post-fix-long-event-purpose-guard-pass.png`, `102-uc118-contact-empty-guard-pass-no-save-pii-local-only.png`
  - UC-78: `19-uc17-end-before-start.png`, `47-uc37-postfix-min-capacity-blocked-before-submit.png`
  - UC-85: `129-uc137-favorite-occupied-marked-reserved-searching.png`, `130-uc137-occupied-favorite-not-recommended-no-save.png`
- Result:
  - UC-39: PASS.
  - UC-63: PASS.
  - UC-71: PASS.
  - UC-73: PASS.
  - UC-75: PASS.
  - UC-78: PASS.
  - UC-85: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
- Commit:
  - `3eb597b` (`docs: 기존 화면 증거로 Safety 케이스 판정을 보강`)
  - Root cause: 이미 Computer Use로 확인한 stale 재확인, 중복 차단, 폼 guard, 특정 공간 충돌 증거가 일부 Safety/오류 케이스 결과 표에 반영되지 않았다.
  - 영향 UC: UC-39, UC-63, UC-71, UC-73, UC-75, UC-78, UC-85.
  - 검증: `git diff --check` 통과, UC 결과 표 대조에서 PASS 106 / PARTIAL 9 / NOT_RUN 27 확인, 개인정보 원문 검색에서 GLS 계정/비밀번호 원문 미포함 확인.

### Iteration 58 - UC-67/72 서버 장애 후 입력 보존과 재개 수정

- User Flow:
  - Computer Use로 실제 Chrome 확장 side panel에서 새 대화를 열었다.
  - 보조 터미널로 `localhost:8000` 서버를 내린 뒤, 실제 side panel 입력칸에 `2026년 7월 24일 금요일 오후 1시부터 오후 2시까지 12명 회의실 예약해줘`를 붙여넣고 `전송`을 클릭했다.
  - side panel에서 원문 한글 사용자 메시지와 `예약 서버와 연결하지 못했어요. 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.` 오류 안내를 관찰했다.
  - 서버를 다시 띄운 뒤 같은 대화에서 `주관단체 Codex E2E 행사명 UC72 서버 복구 회의 행사구분 세미나 사용목적 E2E 테스트 서버 복구 확인`만 붙여넣고 `전송`을 클릭했다.
  - 수정 전에는 메타-only 후속 답변이 이전 슬롯과 병합되지 않고 `예약하실 일정과 인원`을 다시 요구했다.
  - 수정 후에는 신청서 미리보기에 행사구분, 주관단체, 행사명, 행사인원 12명, 사용목적이 표시되고 `빈 공간 찾는 중`으로 이어졌다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았고, 검증 후 side panel `중단` 버튼으로 탐색을 종료했다.
- Result:
  - UC-67: PASS after fix.
  - UC-72: PASS after fix.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
- Root cause:
  - 서버 다운 중 생성된 슬롯/신청 상태는 확장 메모리에 남지만, 서버 `/parse` mirror가 갱신되지 못한 상태에서 복구 후 메타-only follow-up을 보내면 서버가 직전 슬롯/신청 상태를 받지 못했다.
- Structural fix:
  - `/parse` 요청에 optional `client_last_filled_slots`, `client_last_application_state`를 추가했다.
  - 서버는 DB mirror가 없거나 비어 있을 때 클라이언트 fallback 상태를 사용한다.
  - 확장 background chat handler는 `ctx.lastFilledSlots`와 `ctx.applicationState`를 parse 요청에 함께 보낸다.
- Modified files:
  - `server/src/schemas/parse.ts`
  - `server/src/routes/parse.ts`
  - `extension/src/background/apiClient.ts`
  - `extension/src/background/handlers/chatHandler.ts`
- Verification:
  - `server`: `pnpm build` PASS.
  - `extension`: `pnpm build` PASS.
  - Computer Use로 Chrome 확장 reload 완료.
  - Computer Use spot check에서 UC-67/72 모두 PASS.
- Commit:
  - `b49ced7` (`fix: 서버 장애 후 대화 재개 상태를 보존`)
- Evidence:
  - `142-uc67-after-fix-server-down-preserves-original.png`
  - `143-uc72-after-fix-continues-from-server-error.png`

### Iteration 59 - UC-77 전송 연타 방지

- User Flow:
  - Computer Use로 실제 Chrome 확장 side panel에서 `새 대화`를 열었다.
  - 입력칸에 `2026년 7월 31일 금요일 오후 1시부터 오후 2시까지 12명 회의실 예약해줘. 주관단체 Codex E2E 행사명 UC77 연타 방지 회의 행사구분 세미나 사용목적 E2E 테스트 전송 연타 확인`을 붙여넣었다.
  - `전송` 버튼을 실제 마우스로 빠르게 두 번 클릭했다.
  - side panel에서 사용자 메시지가 한 번만 표시되고, assistant 응답도 한 번만 생성되는 것을 확인했다.
  - 화면에는 `신청 정보를 업데이트했어요. 아래 카드에서 확인해 주세요.`, `빈 공간 찾는 중`, `검증 1/6`, `중단`이 표시됐고, 탐색 중 입력칸과 전송 버튼은 disabled 상태였다.
  - 신청서 미리보기에는 행사구분 `교내단체행사 (세미나/스터디)`, 주관단체 `Codex E2E`, 행사명 `UC77 연타 방지 회의`, 행사인원 `12명`, 사용목적 `E2E 테스트 전송 연타 확인`이 한 벌만 표시됐다.
  - `GLS 신청 저장`이나 GLS `저장`은 클릭하지 않았고, 검증 뒤 side panel `중단`으로 탐색을 종료했다.
- Result:
  - UC-77: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
- Root cause:
  - 결함 없음. 현재 UI는 탐색 시작 후 입력/전송을 비활성화하고 빠른 중복 클릭이 중복 요청으로 이어지지 않았다.
- Modified files:
  - 없음.
- Commit:
  - `603e310` (`docs: UC-77 전송 연타 방지 검증을 기록`)
- Evidence:
  - `144-uc77-double-send-single-request-disabled.png`

### Iteration 60 - UC-105/106 제안 수락·거절 표현

- User Flow:
  - UC-105:
    - Computer Use로 실제 Chrome 확장 side panel에서 `새 대화`를 열었다.
    - 입력칸에 `저번처럼 해줘`를 붙여넣고 실제 `전송` 버튼을 클릭했다.
    - side panel에서 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?`, `지난주( )처럼 Codex E2E 기능 검증 반복 회의로 작성할까요?`, `네, 같게요`, `다른 행사예요` 제안 카드를 확인했다.
    - 버튼을 누르지 않고 입력칸에 `좋아`를 붙여넣어 전송했다.
    - 화면이 `지난번 신청 정보를 불러왔어요. 아래 카드에서 확인해 주세요.`와 신청서 미리보기로 전환되는 것을 확인했다.
  - UC-106:
    - 새 대화를 열고 다시 `저번처럼 해줘`를 전송해 같은 제안 카드를 만들었다.
    - 버튼을 누르지 않고 `아니, 2026년 8월 7일 금요일 오후 7시부터 오후 8시까지 30명으로 다시 찾아줘`를 한 번에 입력해 전송했다.
    - side panel 제목이 `2026-08-07 예약`으로 바뀌고 `조건을 수정했어요. 같은 조건으로 다시 검색할게요.`가 표시되는 것을 확인했다.
    - 지난 제안의 신청서 초안으로 진행하지 않고, 새 조건에 필요한 행사 정보 입력 상태로 전환됐다.
- Result:
  - UC-105: PASS.
  - UC-106: PASS.
  - 실제 저장/예약신청: 없음.
  - 실수 신청: 없음.
- Root cause:
  - 결함 없음. 현재 UI는 버튼 수락뿐 아니라 `좋아` 같은 자연어 수락을 수락 의도로 처리했고, `아니, ... 다시 찾아줘`는 제안 거절과 새 조건 수정으로 처리했다.
- Modified files:
  - 없음.
- Commit:
  - `b191477` (`docs: UC-105와 UC-106 제안 응답 검증을 기록`)
- Evidence:
  - `145-uc105-natural-accept-loads-previous-draft.png`
  - `146-uc106-reject-suggestion-new-conditions.png`

## 최종 케이스별 상세 결과

오늘 실행/재검증한 케이스:

| UC | Result | Notes |
| --- | --- | --- |
| UC-01 | PARTIAL | 새 대화 화면에서 앱 목적/예시/입력창은 확인. strict first-install onboarding reset은 아직 미실행. |
| UC-03 | PARTIAL | 최근 대화 목록과 복귀 화면은 확인. strict second-run onboarding suppression은 아직 별도 reset 기반 미검증. |
| UC-04 | PASS | starter 예시 클릭이 실제 예약 탐색으로 이어짐. |
| UC-05 | PASS | 완전한 한 문장 요청이 추가 슬롯 질문 없이 탐색으로 이어짐. |
| UC-06 | PASS | 인원 누락 요청에서 `몇 명이 사용하실 예정인가요?`만 질문하고 `10명/20명/30명` quick reply를 표시. |
| UC-07 | PASS | 2026-06-05 기준 `다음 주 월요일`은 2026-06-08, `모레`는 2026-06-07로 side panel 제목/추천 카드/GLS 신청 팝업 예약날짜에 반영됨. 저장 버튼은 누르지 않음. |
| UC-08 | PASS | `내일 오후 2시부터 4시까지`와 `내일 14시부터 2시간`이 모두 2026-06-06 14:00-16:00으로 해석됨. 2주 이내 날짜라 저장 버튼은 누르지 않음. |
| UC-09 | PASS | `율전 학생회관` 요청이 `학생회관 · 연습실` 1건으로 제한되고 GLS 건물도 학생회관으로 표시됨. 예약 충돌은 솔직히 알리고 다른 캠퍼스/건물로 대체 추천하지 않음. |
| UC-10 | PARTIAL | 완전한 한 줄 요청은 바로 탐색으로 이어졌으나 수동 GLS 대비 시간 측정은 미실행. |
| UC-11 | PASS | 기존 조건 뒤 `아니 7월 1일 오후 5시...` 수정 요청을 최신 조건으로 반영. |
| UC-12 | PASS | 날짜, 시작 시간, 길이, 인원 여러 조건을 한 번에 수정해 `SK 2026-07-01 예약`과 30명 조건으로 재검색. |
| UC-13 | PARTIAL | `다른 공간` 요청에 `같은 조건으로 다른 공간을 찾아볼게요.`라고 응답해 의도와 조건 유지는 확인. 다만 나머지 후보가 불가/timeout이라 두 번째 추천으로 전환되지는 못했고 저장은 disabled. |
| UC-14 | PASS | `취소` 입력 후 예약 진행 중단. |
| UC-15 | PASS | 잡담에 예약 도우미 역할 안내, GLS 자동화 없음. |
| UC-16 | PASS | `담주 화욜 오후 여섯시 스무명`을 2026-06-09 18:00, 20명으로 해석하고 누락된 사용 시간만 질문. |
| UC-17 | PASS | 종료 시간이 시작보다 빠른 요청에서 `자정을 넘기는 예약은 지원하지 않아요...` 안내 후 탐색/저장 없음. |
| UC-18 | PASS | 빈 입력은 전송 버튼 disabled, `@@@` 입력은 이해 가능한 내용으로 다시 알려달라는 안내로 수렴. |
| UC-19 | PASS | `빈 공간 찾는 중`, `검증 n/7` 진행 표시 확인. |
| UC-20 | PASS | 추천 공간 한 곳 표시. |
| UC-21 | PASS | GLS 가용 검증 후 `예약 가능` 추천 표시. |
| UC-22 | PASS | 조건에 맞지 않는 시간/공간에서 `조건에 맞는 공간이 없어요`와 조건 변경 제안을 표시하고, `GLS 신청 저장`은 disabled 상태로 유지됨. |
| UC-23 | PASS | 9999명 요청에서 등록 공간 없음과 인원 조정 안내를 표시하고 저장/신청 없음. |
| UC-24 | PASS | 우선 공간/학생회 명의 권장 경고 표시. |
| UC-25 | PASS | `Codex E2E 테스트 fixture` 및 공간 공지 표시. |
| UC-26 | PASS | 10시간 요청에서 `최대 8시간 이내로 나누거나 시간을 줄여서` 안내하고 탐색 없음. |
| UC-27 | PASS | 탐색 중 `중단` 버튼 클릭 후 예약 진행 중단 메시지와 입력창 복구 확인. |
| UC-28 | PASS | 요청의 행사 정보가 신청서 초안에 반영됨. |
| UC-29 | PASS | 행사 설명 없이 예약 조건만 입력하면 추천 뒤 최근 행사 재사용 여부를 묻고, `다른 행사예요` 선택 후 `단체와 행사명을 알려주세요` 상태와 행사 quick reply를 표시함. 저장으로 바로 진행하지 않음. |
| UC-30 | PASS | 말로 요청한 행사명/주관단체/사용목적 변경이 신청서 미리보기에 반영되고, 기존 공간/날짜/시간/인원은 유지됨. 저장은 클릭하지 않음. |
| UC-31 | PASS after fix | 수정 전 `보충수업` 행사구분 변경은 해석 오류로 실패했으나, 수정 후 `동아리 정기모임`, `보충수업`, `학과 행사`가 각각 학생회/동아리, 보충수업/특강/시험, 학과 주관행사로 분류됨. 저장은 클릭하지 않음. |
| UC-32 | PASS | 행사구분, 주관단체, 행사명, 행사인원, 사용목적 표시. |
| UC-33 | PASS | 사용자 저장 클릭 없이 자동 제출 없음. |
| UC-34 | PASS after fix | valid-capacity 조건에서 GLS `실행되었습니다.` 뒤 side panel이 `신청 저장 완료 · 승인 대기`를 표시하고, 7월 GLS 목록에 테스트 신청 행이 반영됨. |
| UC-36 | PASS | 실제 `GLS 신청 저장` 클릭 직후 `신청 저장 중...` 상태와 입력/전송 disabled 상태를 확인해 중복 저장이 막힘. |
| UC-37 | PASS after fix | 수정 전 GLS 최소인원 팝업 뒤 `submit result unknown (timeout)`만 보였으나, 수정 후 같은 20명/400126 조건은 `조건에 맞는 공간이 없어요`와 disabled 저장 버튼으로 차단됨. |
| UC-38 | PASS after fix | 실제 side panel의 `GLS 미리보기` 클릭으로 GLS 신청 팝업에 2026-08-07, 18:00-20:00, 400126, 40명, 테스트 목적 값이 채워짐. 저장 버튼은 누르지 않았고 실제 신청 행은 생성되지 않음. |
| UC-39 | PASS | 추천 뒤 stale 조건을 만든 UC-121 화면에서 제출 직전 재확인이 `이 공간은 더 이상 비어 있지 않아요`로 막고 disabled 저장 버튼으로 수렴. 잘못된 완료 없음. |
| UC-40 | PASS | 같은 시간대에 이미 접수된 테스트 신청이 있는 조건에서 `조건에 맞는 공간이 없어요`와 disabled 저장 버튼으로 중복 신청 차단. |
| UC-41 | PASS | GLS 로그인 필요/만료 안내 표시. |
| UC-42 | PASS | 재로그인 후 멈췄던 지점부터 이어짐. |
| UC-43 | PASS | 검증 도중 로그인 만료/재로그인 경로에서 이어가기 메시지와 재탐색 확인. |
| UC-44 | PARTIAL | side panel 닫기/다시 열기 뒤 최근 대화 목록과 직전 슬롯 질문/quick reply 상태 복원 확인. strict 추천 상태 복원은 아직 미검증. |
| UC-45 | PASS | 다른 GLS 탭 selected 상태에서도 side panel이 `검증 2/7`과 timeout 안내로 갱신되어 말없이 멈추지 않음. |
| UC-46 | PASS | `저번처럼 해줘` 입력 뒤 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?`와 지난 행사 제안 카드가 표시됨. |
| UC-47 | PASS after fix | `저번처럼 해줘` 제안 승인 뒤 `신청서 미리보기`에 행사구분/주관단체/행사명/인원/목적이 표시되고, 후보 없는 상태의 저장 버튼은 disabled. |
| UC-48 | PASS | 지난 신청 제안 카드에서 `다른 행사예요` 클릭 후 지난 초안을 채우지 않고 새 행사 quick reply와 `단체와 행사명을 알려주세요` 입력 상태로 돌아감. |
| UC-49 | PASS after fix | `저번처럼 해줘`가 새 신청 설명으로 오인되지 않고 `최근 3회 같은 행사로 신청했어요. 같은 정보로 작성할까요?` 제안 카드로 수렴. |
| UC-51 | PASS | 최근 대화 목록 상단에 반복 예약 패턴 알림과 다음 금요일 날짜/시간/공간/확인 버튼이 표시됨. |
| UC-52 | PASS after fix | 반복 알림의 `네, 예약할게요` 클릭 후 조건 재입력 없이 2026-07-10 조건으로 추천 공간/신청서 확인 단계에 도달. 실제 저장 미클릭. |
| UC-53 | PASS | 반복 알림 카드에서 `나중에` 클릭 후 알림 카드가 사라지고 최근 대화 목록만 남음. 자동 예약 진행이나 중복 알림 없음. |
| UC-54 | PASS | 과거 날짜 2026-06-04 알림은 화면에 표시되지 않고, 다가오는 2026-07-17 알림만 표시됨. 보조 DB 확인에서 과거 테스트 알림은 dismissed 처리됨. |
| UC-56 | PASS | 최근 대화 목록에 `기능 검증 회의 예약`, `@@@`, `6/26 학생회 회의` 등 테스트 대화가 제목/미리보기/시간과 함께 표시됨. |
| UC-57 | PASS | `새 대화`만 누른 뒤 아무 입력 없이 목록으로 돌아오자 제목 없는 빈 대화가 추가되지 않음. |
| UC-58 | PASS | 목록에서 `@@@` 대화를 열자 기존 입력과 `예약할 날짜, 시간, 인원처럼...` 응답이 그대로 복원됨. |
| UC-60 | PASS | 목록 제목이 `기능 검증 회의 예약`, `7/2 기능 검증 회의`, `6/26 학생회 회의`처럼 사용자가 구분할 수 있는 예약 조건 기반 제목으로 표시됨. |
| UC-61 | PASS | `@@@` 대화와 `6/26 학생회 회의`를 번갈아 열어도 각 대화의 메시지/진행 상태가 서로 섞이지 않음. |
| UC-62 | PASS | 비밀번호는 GLS 로그인 화면에만 입력. side panel에서 요구하지 않음. |
| UC-63 | PASS | 명시적인 저장 클릭 전에는 어떤 추천/제안/초안 화면에서도 자동 GLS 저장이 발생하지 않았고, 실제 저장은 2주 이후 날짜에서 저장 버튼을 클릭한 케이스에만 한정됨. |
| UC-64 | PASS | 저장 전 추천/초안 요약 표시. |
| UC-65 | PASS | 로그인 필요, 통신 오류, 충돌이 조용히 묻히지 않음. |
| UC-66 | PASS | 오류가 `로그인 필요`, `예약 충돌`, `통신 오류`처럼 사용자 언어로 표시됨. |
| UC-67 | PASS after fix | 서버가 꺼진 상태에서 메시지를 보내자 원문 한글 사용자 메시지는 대화에 남고, `예약 서버와 연결하지 못했어요. 서버가 켜져 있는지 확인한 뒤 다시 시도해 주세요.` 안내와 입력창 복구가 표시됨. |
| UC-68 | PASS after fix | 후보 검증이 오래 걸리면 무한 대기가 아니라 timeout 안내와 입력창 복구로 수렴. |
| UC-69 | PASS | `빈 공간 찾는 중`, `준비 중`, `검증 n/7` 진행 상태 표시. |
| UC-70 | PASS | 검증 상태와 추천/취소 상태가 명확히 표시됨. |
| UC-71 | PASS | UC-40/121에서 같은 시간대 중복 또는 stale 추천 재시도가 중복 저장으로 이어지지 않고 disabled 저장/재확인 안내로 차단됨. |
| UC-72 | PASS after fix | 서버 장애 후 같은 대화에서 신청 메타만 답해도 이전 2026-07-24 13:00-14:00, 12명 조건과 병합되어 신청서 미리보기와 `빈 공간 찾는 중` 단계로 이어짐. 저장은 클릭하지 않고 중단함. |
| UC-73 | PASS | 인원 누락, 오전/오후 모호성, 건물 조건 실패 등에서 비난조가 아니라 필요한 값이나 조건 확장 같은 다음 행동을 안내함. |
| UC-75 | PASS | 장문 입력, 기본 연락처 공백, 최소인원 제한 등 폼/제출 전 실패가 저장 전에 guard 안내로 멈춰 반쯤 작성된 신청이 제출되지 않음. |
| UC-77 | PASS | 전송 버튼을 빠르게 두 번 클릭해도 사용자 메시지/응답/신청서 초안이 한 벌만 표시되고, 탐색 중 입력·전송이 disabled 상태로 유지됨. 저장은 클릭하지 않고 중단함. |
| UC-78 | PASS | 자정 넘김과 GLS 최소인원 거부 조건에서 이유를 화면에 드러내고, 완료로 오인하지 않음. |
| UC-79 | PASS | GLS 화면에 보이는 타인 예약 상세가 side panel 사용자-facing 메시지로 노출되지 않음. |
| UC-84 | PASS | `반도체관 400126호` 요청이 `첨단강의실 (400126)`, `반도체관(40동)` 특정 공간 추천으로 수렴하고 다른 공간을 먼저 추천하지 않음. |
| UC-85 | PASS | 특정 단골 공간이 이미 차 있는 조건에서 `18:00~20:00 예약`과 disabled 저장 버튼으로 멈추고, 사용자 동의 없이 다른 공간으로 조용히 바꾸지 않음. |
| UC-86 | PASS after fix | 수정 전 `학생회관` 단독 요청이 캠퍼스 확인 없이 신청서 초안으로 넘어갔으나, 수정 후 `학생회관은 캠퍼스가 헷갈릴 수 있어요. 명륜 학생회관인지, 율전/자과캠 학생회관인지 알려주세요.` 질문으로 멈춤. 저장 버튼은 disabled. |
| UC-87 | PASS | `자과캠` 요청을 율전/자연과학캠퍼스 계열 후보로 해석함. 후보 검증은 timeout 안내로 끝났지만 저장 버튼은 disabled였고 별칭 인식은 올바른 캠퍼스로 수렴. |
| UC-88 | PARTIAL after fix | 수정 전 `6시 반부터 8시까지`가 오전/오후 재입력 안내와 `행사인원 1명` 초안으로 잘못 수렴했다. 수정 후 오전/오후 재질문 없이 후보 탐색으로 진행되고 `행사인원 12명`을 표시했으나, GLS 후보 검증 timeout으로 최종 추천 카드 시간은 확인하지 못함. |
| UC-89 | PASS | 17분 시작 요청에서 `GLS 공간예약은 30분 단위 시간만 안정적으로 처리` 안내 후 탐색 없음. |
| UC-90 | PASS | 새벽 3시-5시 요청에서 후보 탐색 없이 `09:00부터 22:00 사이처럼 다시 알려주세요` 안내로 멈춤. 지난 신청 제안 카드가 함께 보이는 UX 잔여 리스크는 기록. |
| UC-91 | PASS after fix | 수정 전 오늘 이미 지난 시간 요청이 신청서 초안으로 넘어갔으나, 수정 후 `지난 날짜나 이미 지난 시간으로는 예약할 수 없어요...` 안내만 표시하고 후보 조회/저장 단계로 가지 않음. |
| UC-92 | PASS | 2027-12-31 요청에서 `너무 먼 날짜는 아직 GLS에서 신청 가능 여부를 안정적으로 확인하기 어려워요...` 안내만 표시하고 후보 조회/신청서 초안/저장 단계로 가지 않음. |
| UC-93 | PASS | 2명 요청에서 `수선관 · 세미나실`, `산학협력센터 · 세미나실 I` 같은 소규모 후보만 다루고 40명 이상 최소정원 공간을 부적절하게 추천하지 않음. 후보 검증 timeout 뒤 저장 버튼은 disabled. |
| UC-94 | PASS after fix | 수정 전 특정 건물 no-space에서 인원/시간/날짜 조정만 보였으나, 수정 후 `건물/공간 조건을 빼고 같은 캠퍼스 전체로 넓혀볼 수 있어요.`와 `같은 캠퍼스 전체로 넓혀줘` 버튼을 표시하고, 버튼 클릭 시 반도체관 후보로 재검색됨. 저장은 클릭하지 않음. |
| UC-95 | PASS after fix | 시설·장비 조건 요청에서 미지원 안내를 표시하고, 수정 후 잘못 파싱된 신청서 초안이나 저장 버튼 없이 입력 상태로 복구됨. |
| UC-96 | PASS | 추천 뒤 `아 시간은 19시부터로 바꿔줘` 입력에 조건 수정 안내 후 같은 공간을 19:00-20:00 기준으로 다시 검증하고 카드 시간을 갱신함. |
| UC-98 | PASS | 저장 버튼이 보였지만 자동 제출되지 않음. |
| UC-102 | PASS | 일부 후보 통신 오류 뒤 다음 후보 검증/추천으로 계속 진행. |
| UC-105 | PASS | `저번처럼 해줘` 제안 카드에서 버튼 대신 `좋아`를 전송하자 `지난번 신청 정보를 불러왔어요`와 신청서 미리보기로 전환됨. 저장은 disabled 상태로 실제 저장 없음. |
| UC-106 | PASS | 제안 카드에서 `아니, 2026년 8월 7일 금요일 오후 7시부터 오후 8시까지 30명으로 다시 찾아줘`를 한 번에 전송하자 제목이 `2026-08-07 예약`으로 바뀌고 `조건을 수정했어요...`로 새 조건 흐름에 진입함. 지난 제안 초안으로 진행하지 않음. |
| UC-107 | PASS | 요청 반영 문구와 예약 조건이 화면에 표시됨. |
| UC-108 | PASS | `방금 예약 취소해줘` 요청에 `이미 저장되거나 제출된 예약의 취소·변경은 이 확장에서 대신 처리하지 않아요. GLS 화면에서 직접 확인해 주세요.` 안내를 표시하고 GLS 자동화 없음. |
| UC-111 | PASS | 오전/오후가 빠진 `6시` 요청에서 자동 확정하지 않고 `오전 6시 또는 오후 6시처럼` 재입력 안내. |
| UC-113 | PASS | 매주 화요일 반복 예약 요청에 `반복 예약은 아직 자동으로 처리하지 않아요... 한 번에 하나의 날짜와 시간만 알려주세요.` 안내를 표시하고 조용히 단일 예약으로 축소하지 않음. |
| UC-114 | PASS | 영어 예약 요청은 한국어로 다시 알려달라는 정직한 안내로 수렴하고 GLS 자동화 없음. |
| UC-115 | PASS | UC-34 실제 저장 성공 화면에서 `신청 저장 완료 · 승인 대기`와 GLS 목록 상태 `신청`을 확인해 신청 접수와 승인 완료를 구분함. |
| UC-116 | PASS after fix | 수정 전 장문 행사명/목적이 조용히 잘리고 반복예약으로 오탐됐으나, 수정 후 `행사명이 너무 길어요... 50자 이내` 안내로 제출 전 멈춤. 저장 버튼은 노출되지 않음. |
| UC-117 | PASS | `활동`을 임의 행사구분으로 확정하지 않고 학생회/동아리 행사인지 학과 주관 행사인지 확인 질문으로 멈춤. |
| UC-118 | PASS | 실제 GLS 폼에서 연락처를 빈 값으로 만든 뒤 side panel 저장 경로가 `GLS 기본 연락처가 비어 있어요...` 안내로 멈춤. GLS 저장 클릭/신청 접수 없음. |
| UC-120 | PASS | 최종 검토 단계에서 `취소`로 저장 전 중단. |
| UC-121 | PASS | 실제 GLS seed 저장으로 stale 조건을 만든 뒤 같은 추천의 `GLS 신청 저장` 클릭 시 `제출 직전에 다시 확인했더니 이 공간은 더 이상 비어 있지 않아요...` 안내와 disabled 저장 버튼으로 중복 저장 차단. |
| UC-122 | PASS after fix | GLS 로그인 필요 상태에서 탭 강제 전환 없이 side panel 로그인 카드 표시. |
| UC-124 | PASS | 이미 seed 예약이 있는 2026-08-31 18:00-20:00, 400126 조건에서 `18:00~20:00 예약`과 `조건에 맞는 공간이 없어요`를 표시하고 저장/미리보기 버튼을 disabled로 유지. 자동 빈 시간 스캔이나 조용한 다른 방 대체 없음. |
| UC-127 | PASS after fix | 수정 전 한글 자모 상태 `ㄷㅏ`에서 Enter가 메시지를 조기 전송했으나, 수정 후 `ㄷㅏ` + Enter는 입력창에 남고 완성 문장 `다음 주 화요일` + Enter만 실제 전송됨. |
| UC-128 | PASS | 긴 여러 줄 요청을 붙여넣어도 입력창, 사용자 메시지 버블, 추천 카드, 신청서 초안, 하단 버튼들이 side panel 안에서 줄바꿈되고 화면 밖으로 밀리지 않음. 실제 저장 미클릭. |
| UC-129 | PASS | 최소 폭에 가까운 side panel에서 추천 공간, 신청서 요약, 저장/미리보기/수정/제출/취소성 버튼을 스크롤로 모두 볼 수 있고 텍스트/버튼 겹침 없음. 실제 저장 미클릭. |
| UC-130 | PASS | 제출 전 검토 단계의 테스트 대화를 최근 목록에서 삭제하자 저장/예약신청으로 이어지지 않고 목록으로 복귀함. |
| UC-131 | PASS | 삭제 후 `UC128 긴 붙여넣기 검증 회의` 항목이 최근 대화 목록에서 사라져 테스트 단체/행사명이 목록에 남지 않음. |
| UC-132 | PASS | extension reload 후 side panel 새 대화/입력/전송/오류 복구 버튼이 정상 동작. |
| UC-133 | PASS | 숫자 `400126`만 포함한 요청을 공간코드로 해석해 `첨단강의실 (400126)`, `반도체관(40동)` 특정 공간 추천을 표시함. |
| UC-134 | PARTIAL | 일반 `회의실` 요청에서 개인화 후보 `반도체관 · 첨단강의실`이 첫 후보로 올라왔지만, GLS 후보 검증 timeout으로 최종 추천 카드까지 완료되지는 않음. 저장 미클릭. |
| UC-135 | PASS | 특정 400126 요청의 추천 카드에 `추천 이유 최근 같은 요일·시간대 예약에서 4회 사용`이 표시됨. 저장 미클릭. |
| UC-136 | PARTIAL | 이력 없는 후보 공간에서는 근거 없는 `추천 이유`가 표시되지 않았지만, 예약 충돌 또는 GLS 후보 검증 timeout으로 최종 추천 카드가 만들어지지 않아 strict PASS로 세지 않음. 저장 버튼 disabled. |
| UC-137 | PASS | 이미 seed 예약이 있는 단골 공간 `반도체관 · 첨단강의실`은 `18:00~20:00 예약`으로 표시되어 예약 가능 추천에서 제외됨. 저장 버튼 disabled. |
| UC-138 | NOT_RUN | 실제 side panel UI에서 소속 단체 코드/우선 배정 공간 조건을 설정하는 사용자 경로가 없어 Computer Use primary 실행 조건을 만들지 못함. 서버 정렬 로직은 보조 verifier에 있으나 PASS 판정에는 사용하지 않음. |
| UC-139 | PASS | 같은 슬롯 거절 fixture가 있는 `산학협력센터 · 세미나실 I`이 재검색에서 1순위로 독점되지 않고 `수선관 · 세미나실` 뒤에 표시됨. 저장 버튼 disabled. |
| UC-140 | PASS | 거절 이력 후보 `산학협력센터 · 세미나실 I`이 후보 목록에서 제거되지 않고 계속 표시됨. 저장 버튼 disabled. |
| UC-141 | PASS | 400126 거절 이벤트가 있는 상태에서도 강한 완료 이력 때문에 `반도체관 · 첨단강의실`이 같은 요일·시간대 일반 요청의 첫 후보로 표시됨. 저장 미클릭. |
| UC-142 | PARTIAL | 다른 시작 시간에서도 거절 후보가 후보군에서 제거되지 않는 것은 확인했지만, UI가 점수 강도 차이를 직접 표시하지 않아 strict PASS로 세지 않음. 저장 버튼 disabled. |
| UC-143 | PASS | 반복 알림 카드에 날짜/시간/행사 맥락과 공간 `Codex E2E 첨단강의실 400126`이 함께 표시됨. |
| UC-144 | PASS after fix | 알림 수락 후 `공간코드 400126`이 반복 예약 guard에 막히지 않고, 추천 공간 `첨단강의실 (400126)` 및 GLS `[400126]` 화면으로 이어짐. 실제 저장 미클릭. |
| UC-145 | PASS | 공간 정보가 없는 테스트 반복 알림이 `이전 추천 공간` placeholder를 표시했고, 없는 공간명/공간번호를 지어내지 않음. 알림 수락/저장 미클릭. |

## 남은 FAIL/BLOCKED와 이유

- 오늘 수정 후 관찰된 FAIL: 없음.
- 오늘 BLOCKED: 없음.
- 전체 기준 남은 NOT_RUN: 22개.
- UC-59는 실제 UI 삭제 확인이 필요한 케이스라 사용자 삭제 확인 전까지 NOT_RUN으로 남긴다.
- UC-138은 현재 side panel에 사용자 소속 단체 코드/전용 공간 조건을 설정하는 UI가 없어 Computer Use primary 실행 조건을 만들 수 없었다.
- 최종 목표는 아직 완료되지 않았으므로 `update_goal complete`는 하지 않는다.

## 남은 리스크와 다음 권장 작업

- UC-01 strict onboarding reset을 실제 Chrome 상태로 재현해야 한다.
- 제출 성공/실패/중복 방지 계열은 실제 저장 guard와 취소 가능성을 재검토하며 별도 실행해야 한다.
- 리마인드/개인화 케이스는 테스트 전용 DB fixture를 만든 뒤 side panel에서 Computer Use로 검증해야 한다.
- 전체 UC-01부터 UC-145 문서 순서 회귀를 계속 수행해야 한다.
