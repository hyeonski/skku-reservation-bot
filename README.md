# 교내 공간 예약 에이전트 MVP

성균관대학교 GLS 공간대여신청 흐름을 보조하는 Chrome Extension MVP입니다.

## 포함 기능

- 자연어 예약 요청 파싱
- 채팅형 예약 요청/후속 요청 UI
- 날짜/시간/인원/건물/공간 선호 추출
- MySQL API 기반 추천
- OpenAI 호환 LLM API 기반 요청 파싱
- 인원 기반 최적 공간 정렬
- DB에 저장된 학과 전용/반려 위험 공간 후순위 처리
- DB 예약 현황 슬롯 기준으로 이미 선점된 시간 제외
- 부족 정보가 있으면 대화형으로 날짜/시간/인원 보완
- 다른 곳, 더 큰 방, 율전만, 반려 위험 제외 재추천
- 추천 이유 표시
- 신청 전 최종 확인 후 GLS 폼 입력
- 포털 폼 자동 입력용 content script
- 반복 입력값 저장
- 추천 결과에 대한 좋음/아쉬움 피드백 저장

## 실행 방법

1. Chrome 주소창에서 `chrome://extensions` 열기
2. 우측 상단 개발자 모드 켜기
3. `압축해제된 확장 프로그램을 로드합니다` 클릭
4. 이 폴더(`/Users/minseong/my/교내예약`) 선택
5. 확장 아이콘을 눌러 자연어로 요청 입력

## MySQL 서버 연결 구조

확장 프로그램은 MySQL에 직접 접속하지 않습니다. 브라우저에 DB 비밀번호를 넣으면 노출되기 때문에,
`server/`의 API 서버가 MySQL에 접속하고 확장은 기본값으로 `http://localhost:8787` API를 호출합니다.
팀 서버나 배포 API 주소는 Chrome 확장 프로그램의 옵션 페이지에서 바꿀 수 있습니다.

스키마 초안은 `sql/schema.sql`에 저장했습니다. 아직 실제 DB에는 실행하지 않았습니다.
샘플 공간 데이터 fallback은 제거했습니다. 추천 결과는 서버가 MySQL에서 조회한 공간만 사용합니다.
팀 미팅 실행 순서는 `docs/TEAM_SETUP.md`에 정리했습니다.
공간 목록은 `spaces`, 예약 현황은 `space_reservation_slots`, 추천 요청은 `reservation_requests`, 선택/폼입력 기록은 `reservation_history`,
피드백은 `feedback_events`에 저장됩니다.
후속 요청은 기존 요청 맥락을 서버로 함께 보내 LLM이 조건을 유지한 채 다시 파싱합니다.

서버 실행 준비:

```bash
cd /Users/minseong/my/교내예약/server
cp .env.example .env
npm install
npm run doctor
npm run dev
```

`.env`에는 실제 `OPENAI_API_KEY`와 `OPENAI_MODEL`을 넣어야 합니다. DB 생성/테이블 생성은 팀원들과
`sql/schema.sql`을 검토한 뒤 진행하세요.

## 예시 입력

```text
다음 주 화요일 6시 20명 학생회 회의
5월 17일 오후 3시부터 2시간 35명 세미나실 잡아줘
내일 율전 제2공학관 20명 회의실
```

## 주의

실제 GLS DOM 구조는 학교 포털 화면에서 확인 후 `src/selectors.js`를 조정해야 합니다.
현재 버전은 서버 API, MySQL, LLM API가 실행되어야 추천이 동작합니다.
