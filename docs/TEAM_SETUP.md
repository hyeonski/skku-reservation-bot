# 팀 미팅 실행 체크리스트

이 문서는 실제 DB/LLM 연결을 팀 미팅 때 바로 진행하기 위한 순서입니다.

## 1. 환경변수 입력

```bash
cd /Users/minseong/my/교내예약/server
cp .env.example .env
```

`.env`에 다음 값을 입력합니다.

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## 2. 설정값만 점검

이 명령은 DB나 LLM API에 접속하지 않고, 값이 비어 있는지만 확인합니다.

```bash
npm run doctor
```

## 3. DB 스키마 적용

팀에서 스키마를 확인한 뒤 MySQL 클라이언트에서 실행합니다.

```bash
mysql -h <MYSQL_HOST> -P <MYSQL_PORT> -u <MYSQL_USER> -p < /Users/minseong/my/교내예약/sql/schema.sql
```

`spaces` 테이블에는 실제 포털에서 수집한 공간 데이터가 들어가야 추천이 나옵니다.

## 4. 서버 실행

```bash
npm run dev
```

서버 주소는 기본값 기준 `http://localhost:8787`입니다.

## 5. 확장 프로그램 실행

1. Chrome에서 `chrome://extensions` 열기
2. 개발자 모드 켜기
3. `/Users/minseong/my/교내예약` 폴더를 압축해제 확장 프로그램으로 로드
4. 확장 세부정보 또는 우클릭 메뉴에서 옵션 페이지 열기
5. 팀 서버를 쓰는 경우 API Base URL 저장
6. 채팅창에 자연어 요청 입력
7. 날짜/시간/인원 중 빠진 값이 있으면 같은 입력창에서 답변
8. 채팅 안에 뜨는 추천 카드와 추천 이유 확인
9. 채팅 안의 `다른 곳`, `더 큰 방`, `율전만`, `반려 위험 제외`로 재추천 확인
10. 공간 선택 후 대화 말풍선의 `확인 후 폼 채우기`
11. 추천 결과 확인 후 피드백 영역에서 좋음/아쉬움 선택 및 전송

## 현재 연결 흐름

```text
Chrome Extension
  -> configured API base URL
  -> LLM API로 자연어 파싱
  -> MySQL spaces/space_reservation_slots/rejected_spaces/reservation_history 조회
  -> 추천 결과 반환
  -> feedback_events에 피드백 저장
```
