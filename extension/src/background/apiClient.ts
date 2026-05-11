/**
 * 서버 API 호출 래퍼 (D-019, D-021, D-024).
 *
 * 모든 요청에 X-Client-Id 헤더 자동 부착 (getOrCreateClientId).
 *
 * TODO:
 * - SERVER_BASE_URL을 build env로 주입 (개발: http://localhost:3000)
 * - parse({ conversationId, history, now })
 * - upsertConversation({ id, history, status?, lastIntent?, lastFilledSlots? })
 * - getConversation(id)
 * - abandonConversation(id)
 * - listSpaces({ headcount, campusCode?, buildingNo?, userOrgCode? })
 */

import type { ParseResult, SpaceCandidate, ChatMessage } from '../shared/types';

export interface ParseArgs {
  conversationId: string;
  history: ChatMessage[];
  now: string;
}

export async function parse(_args: ParseArgs): Promise<ParseResult> {
  // TODO
  throw new Error('not implemented');
}

export async function listSpaces(_args: {
  headcount: number;
  campusCode?: string;
  buildingNo?: string;
  userOrgCode?: string;
}): Promise<SpaceCandidate[]> {
  // TODO
  throw new Error('not implemented');
}

// TODO: upsertConversation / getConversation / abandonConversation
