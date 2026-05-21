/**
 * 인라인 SVG 아이콘 (lucide 스타일 stroke 라인).
 *
 * 핸드오프 03-design-tokens.md 의 아이콘 매핑을 따른다.
 * Phase 1a 에서는 인라인 SVG 만 사용 — 추후 lucide-react 로 교체할 때는
 * 이 파일 한 곳만 바꿔도 되도록 컴포넌트로 추상화.
 *
 * prototype/ui.jsx 의 Icon 컴포넌트 path 데이터와 동일.
 */

import type { CSSProperties } from 'react';

export type IconName =
  | 'send'
  | 'back'
  | 'forward'
  | 'history'
  | 'plus'
  | 'close'
  | 'more'
  | 'trash'
  | 'bell'
  | 'calendar'
  | 'users'
  | 'clock'
  | 'building'
  | 'info'
  | 'sparkles'
  | 'edit'
  | 'search'
  | 'lock'
  | 'menu'
  | 'check'
  | 'x-circle'
  | 'alert'
  | 'refresh'
  | 'settings';

interface IconProps {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, style, className }: IconProps) {
  const stroke = {
    width: size,
    height: size,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style,
    className,
  };

  switch (name) {
    case 'send':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M2 8L14 2L8 14L7 9L2 8Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'back':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M10 13L5 8L10 3" />
        </svg>
      );
    case 'forward':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M6 3L11 8L6 13" />
        </svg>
      );
    case 'history':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5V8L10 9.5" />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M8 3V13M3 8H13" />
        </svg>
      );
    case 'close':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M4 4L12 12M12 4L4 12" />
        </svg>
      );
    case 'more':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="4" cy="8" r="1" fill="currentColor" />
          <circle cx="8" cy="8" r="1" fill="currentColor" />
          <circle cx="12" cy="8" r="1" fill="currentColor" />
        </svg>
      );
    case 'trash':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M3 4H13M6 4V3C6 2.4 6.4 2 7 2H9C9.6 2 10 2.4 10 3V4M5 4L5.5 13C5.5 13.5 6 14 6.5 14H9.5C10 14 10.5 13.5 10.5 13L11 4" />
        </svg>
      );
    case 'bell':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M5 10L4 12H12L11 10V7C11 5 9.5 3.5 8 3.5C6.5 3.5 5 5 5 7V10Z" />
          <path d="M7 13.5C7 14 7.5 14.5 8 14.5C8.5 14.5 9 14 9 13.5" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <rect x="2.5" y="3.5" width="11" height="10" rx="1" />
          <path d="M5 2V5M11 2V5M2.5 6.5H13.5" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="6" cy="6.5" r="2.5" />
          <path d="M2 13C2 11 4 9.5 6 9.5C8 9.5 10 11 10 13" />
          <circle cx="11" cy="7" r="1.8" />
          <path d="M10.5 9.5C12.5 9.5 14 11 14 13" />
        </svg>
      );
    case 'clock':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5V8L10 9.5" />
        </svg>
      );
    case 'building':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <rect x="3" y="2.5" width="10" height="11" />
          <path d="M5.5 5H6.5M9.5 5H10.5M5.5 7.5H6.5M9.5 7.5H10.5M5.5 10H6.5M9.5 10H10.5" />
        </svg>
      );
    case 'info':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 7.5V11M8 5.5V5.6" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M6 2L7 5L10 6L7 7L6 10L5 7L2 6L5 5L6 2Z" fill="currentColor" />
          <path d="M12 9L12.7 10.3L14 11L12.7 11.7L12 13L11.3 11.7L10 11L11.3 10.3L12 9Z" fill="currentColor" />
        </svg>
      );
    case 'edit':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M11.5 2.5L13.5 4.5L5 13L2 14L3 11L11.5 2.5Z" />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
      );
    case 'lock':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <rect x="3.5" y="7" width="9" height="7" rx="1" />
          <path d="M5.5 7V5C5.5 3.5 6.5 2.5 8 2.5C9.5 2.5 10.5 3.5 10.5 5V7" />
        </svg>
      );
    case 'menu':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M3 5H13M3 8H13M3 11H13" />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M3 8.5L6.5 12L13 4.5" />
        </svg>
      );
    case 'x-circle':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="8" cy="8" r="6" />
          <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" />
        </svg>
      );
    case 'alert':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M8 2L14 13H2L8 2Z" />
          <path d="M8 7V10M8 11.5V11.6" />
        </svg>
      );
    case 'refresh':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <path d="M3 8C3 5.2 5.2 3 8 3C10.2 3 12 4.4 12.8 6.5M13 8C13 10.8 10.8 13 8 13C5.8 13 4 11.6 3.2 9.5" />
          <path d="M13 3.5V6.5H10M3 12.5V9.5H6" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 16 16" {...stroke}>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 2V3.5M8 12.5V14M3.5 8H2M14 8H12.5M4.5 4.5L3.5 3.5M12.5 12.5L11.5 11.5M11.5 4.5L12.5 3.5M3.5 12.5L4.5 11.5" />
        </svg>
      );
  }
}
