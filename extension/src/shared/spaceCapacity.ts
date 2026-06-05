import type { SpaceCandidate } from './types';

export function candidateSupportsHeadcount(
  candidate: SpaceCandidate | null,
  headcount: number | null,
): boolean {
  if (!candidate || headcount == null) return false;
  return candidate.capacityMin <= headcount && headcount <= candidate.capacityMax;
}

export function describeCapacityMismatch(
  candidate: SpaceCandidate,
  headcount: number,
): string {
  return `요청 인원 ${headcount}명은 ${candidate.roomName}(${candidate.glsSpaceCode})의 정원 범위 ${candidate.capacityMin}-${candidate.capacityMax}명에 맞지 않아요. 인원을 조정하거나 다른 공간을 선택해 주세요.`;
}
