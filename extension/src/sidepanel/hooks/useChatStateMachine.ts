/**
 * 채팅 phase 머신 — useConversation 의 state 에서 파생.
 *
 * (slots, applicationState, automationStatus, submitStep, proposedCandidate)
 * 조합을 기반으로 ChatPhase 와 UI 표시 (label/placeholder/hints/composer disabled)
 * 를 계산한다.
 *
 * 5-state-machine.md 의 phase 전이를 derived state 로 표현 — useState 로 phase 를
 * 직접 들고 있지 않고 매 렌더 시 state 에서 계산. 이렇게 두면 backend 메시지가
 * state 를 갱신할 때 phase 가 자동으로 따라온다.
 */

import { useMemo } from 'react';
import type { ChatPhase } from '../types';
import type { ConversationState } from './useConversation';

export interface ChatMachineView {
  phase: ChatPhase;
  label: string;
  placeholder: string;
  hints: string[];
  composerDisabled: boolean;
  /** 헤더 title — 슬롯이 채워지면 자동 생성, 아니면 "새 대화". */
  title: string;
}

const PHASE_LABEL: Record<ChatPhase, string> = {
  starter: '시작',
  'slots-end': '정보 확인',
  'slots-count': '정보 확인',
  'awaiting-login': '로그인 대기',
  searching: '탐색 중',
  'awaiting-relogin': '재로그인 대기',
  recommended: '후보 확인',
  'meta-p2': '신청 메타',
  'meta-collect': '신청 메타',
  draft: '검토',
  submitting: '신청 저장 중',
  done: '신청 저장 완료',
  'failed-retry': '재시도',
  failed: '실패',
};

const PHASE_PLACEHOLDER: Record<ChatPhase, string> = {
  starter: '예: 내일 오후 6시 20명 회의실',
  'slots-end': '예: 20시까지 / 2시간',
  'slots-count': '몇 명이서 사용하세요?',
  'meta-collect': '단체와 행사명을 알려주세요',
  draft: '수정 사항이나 "제출" 이라고 입력하세요',
  'failed-retry': '조정할 조건을 알려주세요 (인원/시간/날짜)',
  searching: '탐색 중…',
  'awaiting-login': 'GLS 로그인 후 진행됩니다',
  'awaiting-relogin': 'GLS 로그인 후 진행됩니다',
  submitting: '신청 저장 중…',
  done: '신청은 저장됐고 승인은 GLS에서 확인하세요',
  failed: '대화가 종료되었어요',
  recommended: '메시지 입력…',
  'meta-p2': '메시지 입력…',
};

const PHASE_HINTS: Record<ChatPhase, string[]> = {
  starter: [],
  'slots-end': ['20시까지', '2시간', '한 시간만'],
  'slots-count': ['10명', '20명', '30명'],
  'awaiting-login': [],
  searching: [],
  'awaiting-relogin': [],
  recommended: [],
  'meta-p2': [],
  'meta-collect': ['SW학생회 운영회의', '동아리 연습', '학회 세미나'],
  draft: ['제출', '행사명만 바꾸기', '다른 공간'],
  submitting: [],
  done: [],
  'failed-retry': ['100명으로 줄여서 다시', '시간대 19–21시로', '다음 주 같은 요일로'],
  failed: [],
};

function isDisabled(phase: ChatPhase): boolean {
  return (
    phase === 'searching' ||
    phase === 'submitting' ||
    phase === 'awaiting-login' ||
    phase === 'awaiting-relogin' ||
    phase === 'done' ||
    phase === 'failed'
  );
}

function derivePhase(s: ConversationState): ChatPhase {
  // 1) 제출 진행 / 완료 우선.
  if (s.submitStep === 'saved' || s.automationStatus.kind === 'done') return 'done';
  if (s.submitStep === 'filling' || s.submitStep === 'saving' || s.automationStatus.kind === 'submitting') {
    return 'submitting';
  }
  if (s.conversationStatus !== 'active') return 'starter';

  // 2) automation 상태 분기.
  const auto = s.automationStatus.kind;
  if (auto === 'login_required') {
    return s.automationStatus.reason === 'expired'
      ? 'awaiting-relogin'
      : 'awaiting-login';
  }
  if (auto === 'opening_gls' || auto === 'searching') {
    // 후보 발견 직전까지는 searching. proposedCandidate 가 들어오면 아래 recommended 로 떨어짐.
    return s.proposedCandidate ? 'recommended' : 'searching';
  }
  if (auto === 'no_candidate') return 'failed-retry';
  if (auto === 'candidate_found') {
    // 후보 확정 — 서버가 신청서 수집을 완료했다고 판단한 경우에만 저장 검토로 넘어간다.
    const draft = s.applicationState?.draft;
    if (
      draft &&
      !s.applicationState?.needs_application_collection &&
      draft.organization &&
      draft.eventName &&
      draft.purpose &&
      draft.hangsaGbCode
    ) {
      return 'draft';
    }
    // P2 메모리 추천이 있고 사용자가 아직 수락/거절 안 한 상태면 meta-p2.
    if (s.applicationState?.suggested_memory) return 'meta-p2';
    return 'meta-collect';
  }

  // 3) idle / 첫 대화 — slots 누락 분기.
  if (s.messages.length === 0) return 'starter';
  const missing = new Set(s.missingRequired);
  if (missing.has('headcount')) return 'slots-count';
  if (missing.has('end_time') || missing.has('duration_min')) return 'slots-end';
  if (missing.size > 0) return 'starter';

  const slots = s.slots;
  if (slots && slots.headcount == null) return 'slots-count';
  if (slots && !slots.end_time && slots.duration_min == null) return 'slots-end';

  return 'starter';
}

function deriveTitle(s: ConversationState): string {
  // 슬롯이 채워지면 "{date} {event ?? '예약'}", 아니면 "새 대화".
  const date = s.slots?.date;
  const event = s.applicationState?.draft?.eventName;
  if (date && event) return `${date} ${event}`;
  if (date) return `${date} 예약`;
  return '새 대화';
}

export function useChatStateMachine(state: ConversationState): ChatMachineView {
  return useMemo(() => {
    const phase = derivePhase(state);
    return {
      phase,
      label: PHASE_LABEL[phase],
      placeholder: PHASE_PLACEHOLDER[phase],
      hints: PHASE_HINTS[phase],
      composerDisabled: isDisabled(phase),
      title: deriveTitle(state),
    };
  }, [state]);
}
