export const SMALL_HEADCOUNT_LIMIT = 3;
export const GENERAL_SMALL_HEADCOUNT_CAPACITY_MAX = 24;

interface SmallHeadcountFitInput {
  headcount: number;
  hasExplicitLocation: boolean;
}

export function getGeneralSmallHeadcountCapacityMax({
  headcount,
  hasExplicitLocation,
}: SmallHeadcountFitInput): number | null {
  if (hasExplicitLocation) return null;
  if (headcount <= SMALL_HEADCOUNT_LIMIT) return GENERAL_SMALL_HEADCOUNT_CAPACITY_MAX;
  return null;
}
