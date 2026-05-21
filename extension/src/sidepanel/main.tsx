/**
 * 사이드패널 진입점.
 *
 * Phase 0 마이그레이션 시점에는 빈 셸만 렌더한다 — 채팅·세션·온보딩 UI는
 * Phase 1a 에서 prototype/styles.css 기반으로 채워 넣는다.
 *
 * Pretendard Variable 은 @fontsource-variable 로 번들 (MV3 CSP 가 외부
 * CDN 폰트를 막으므로 핸드오프 03-design-tokens 의 CDN 옵션은 사용하지 않음).
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Pretendard Variable — 번들로 가져온다 (MV3 CSP 회피).
// 패키지가 woff2 + @font-face 만 노출하므로 CSS import 만으로 충분.
import 'pretendard/dist/web/variable/pretendardvariable.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
