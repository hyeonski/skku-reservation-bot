/**
 * 공간 메타데이터 시딩 스크립트 (D-015, D-020).
 *
 * 실행:
 *   GLS_COOKIE="..." pnpm scrape:spaces
 *
 * 동작:
 * 1. Playwright Chromium 띄움, 환경변수 GLS_COOKIE를 kingoinfo.skku.edu 쿠키로 주입
 * 2. https://kingoinfo.skku.edu 진입 → 세션 유효한지 확인 (login.skku.edu 리다이렉트면 abort)
 * 3. 메뉴: 신청/자격관리 → 공간대여신청 → 예약신청 모달 오픈
 * 4. page.evaluate 안에서:
 *    - dsCboCampusCd 순회 (양 캠퍼스)
 *    - 각 캠퍼스: dsCboBuildCd 순회
 *    - 각 건물: cboBuildCd 콤보 클릭 → dsCboSpace dump
 * 5. 각 row를 D-022 Space 모델로 Prisma upsert (glsSpaceCode unique key 사용, 멱등)
 *
 * @gls/nexacroPaths, @gls/nexacroActions, @gls/schemas 사용.
 *
 * TODO: 구현
 */

async function main() {
  // TODO
  console.log('TODO: scrape spaces');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
