# Sidepanel — Dev Navigation & Smoke Test

Phase 1c (실 GLS 자동화 통합) 기준 가이드.

## 빌드 / 실행

```bash
cd extension
pnpm build
# chrome://extensions 에서 dist/ 를 로드 (또는 reload)
```

별도 터미널에서 서버 기동:

```bash
cd server
pnpm dev   # http://localhost:8000 에서 Fastify + Prisma 실행
```

확장 액션 아이콘 클릭 → 우측에 사이드패널이 열린다.

## 화면 점프 — 우하단 `dev · jump`

| 라벨 | 동작 |
|---|---|
| Onboarding | 2 스텝 온보딩 (정적) |
| Sessions | 서버 대화 목록 + P3 리마인드 배너 |
| Chat — starter | 빈 채팅 + 예시 칩 |
| Chat (current) | 현재 진행 중인 대화 화면 |

세션 목록의 항목 클릭은 background `POPUP_GET_STATUS` 로 이력을 복원한다.
reminder accept 는 새 대화를 만들고 서버가 내려준 자연어 prompt 를 기존 채팅
파이프라인에 넣어 시작한다.

## End-to-End 자동화 스모크 테스트

전제 조건:
- 서버 (`localhost:8000`) 실행 중
- 사용자가 별도 탭에서 GLS (`https://kingoinfo.skku.edu/`) 로그인 완료
- 활성 또는 비활성 탭에 GLS 가 떠 있어도 되고 / 없어도 됨 (background 가 자동으로 처리)

순서:

1. 사이드패널 → `Chat — starter`
2. 예시 칩 클릭 또는 직접 입력: 예) **"내일 6시 20명 학생회 회의"**
3. 봇이 빠진 정보를 묻거나, 다 채워지면 곧바로 검증 시작
   - 빠진 정보 채우는 칩: `슬롯-end` → "20시까지" 등 / `슬롯-count` → "20명"
4. `ready_to_search=true` 가 되면 SearchProgressCard 가 나타남
   - 전체 후보 목록이 pending 마커로 표시
   - 후보 단위로 회전 → ✓ / ✗ 마커로 갱신
   - 우측 mono 텍스트에 "18:00 충돌" 같은 사유
5. 가용 후보 발견 시 RecommendationCard 표시
6. 채팅으로 단체/행사명 입력 (예: "SW학생회 운영회의, 동아리 정기회의")
7. `applicationState.draft` 가 완성되면 DraftCard 노출
8. DraftCard [GLS 제출] 클릭
   - SubmitProgressCard 가 filling → saving → saved 로 단계 전환
   - 동시에 GLS 탭에서 모달이 자동 채워지고 저장됨
   - 완료 시 OS notification "예약 완료" + 봇이 완료 메시지

## 분기 시나리오

### "다른 공간" — RecommendationCard 에서 [다른 공간 찾기]
- background `continueAfterRejection` 가 다음 후보부터 iterate
- SearchProgressCard 의 currentIdx 가 증가
- 큐가 비면 자동으로 `no_candidate` → NoSpaceCard

### GLS 로그인 안 됨
- 검증 시도 시 content script 가 `login.skku.edu` 리다이렉트를 감지 → `loginRequired`
- BG → `LOGIN_NEEDED` + `BG_STATUS_UPDATE { kind: 'login_required', reason: 'needed' }`
- 사용자가 [GLS 로그인 열기] 클릭 → background 가 GLS 로그인 탭 생성
- 로그인 탭이 `kingoinfo.skku.edu` 로 돌아오면 `LOGIN_COMPLETE` 감지 후 검색 자동 재개

### 검증 도중 세션 만료
- BG → `SESSION_EXPIRED { resumeIdx }` + `BG_STATUS_UPDATE { kind: 'login_required', reason: 'expired' }`
- GLSLoginCard `variant="expired"` 가 렌더되고, 로그인 완료 후 멈춘 후보부터 자동 재개

## 알려진 한계 / 다음 phase 로 이월

- 진행 중 검색 카드의 후보별 marker 전체 복원은 아직 제한적임
- DevNavigator 는 개발 빌드에서만 보임

## 메시지 흐름 요약

```
사용자 입력
  ↓ POPUP_CHAT_REQUEST
background → apiClient.parse → ParseResult
  ↓ BG_CHAT_RESPONSE
사이드패널: messages/slots/applicationState 갱신
  ↓ (ready_to_search) POPUP_START_SEARCH
background:
  apiClient.listSpaces → SpaceCandidate[]
  emit BG_SEARCH_STARTED { candidates }                     ← 사이드패널 후보 리스트 그림
  for each candidate:
    chrome.tabs.sendMessage(BG_CHECK_AVAILABILITY)
    ← ContentAvailabilityResult
    emit BG_CANDIDATE_RESULT { code, available, why, idx }  ← 마커 갱신
    if available:
      emit BG_CANDIDATE_PROPOSAL                            ← RecommendationCard 노출
      break
  if none available: BG_STATUS_UPDATE { kind: no_candidate } ← NoSpaceCard

사용자 메타 입력 → /parse → applicationState.draft 채워짐 → DraftCard 자동 노출

[GLS 제출] 클릭
  ↓ POPUP_CONFIRM_RESERVATION { spaceCode, formData, confirmed:true }
background → submitConfirmedReservation:
  emit BG_SUBMIT_STATUS { step: 'filling' }
  setTimeout 800ms → emit BG_SUBMIT_STATUS { step: 'saving' }
  chrome.tabs.sendMessage(BG_SUBMIT_RESERVATION)
  ← ContentSubmitResult ok
  emit BG_SUBMIT_STATUS { step: 'saved' }
  emit BG_STATUS_UPDATE { kind: 'done' }
  emit BG_RESERVATION_DONE
  chrome.notifications.create("예약 완료")
```
