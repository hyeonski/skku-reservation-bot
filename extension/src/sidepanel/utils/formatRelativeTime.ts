const relativeFormatter = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

function floorDivision(value: number, unit: number): number {
  return Math.floor(value / unit);
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 1) return '방금 전';
  if (absMinutes < 60) return relativeFormatter.format(diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) return relativeFormatter.format(diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  const absDays = Math.abs(diffDays);
  if (absDays < 7) return relativeFormatter.format(diffDays, 'day');

  const diffWeeks = diffDays < 0
    ? -floorDivision(absDays, 7)
    : floorDivision(absDays, 7);
  return relativeFormatter.format(diffWeeks, 'week');
}
