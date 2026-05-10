const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDate(dateValue) {
  if (!dateValue) return "-";
  const date = new Date(`${dateValue}T00:00:00`);
  return `${dateValue} (${DAY_LABELS[date.getDay()]})`;
}

export function formatTimeRange(request) {
  if (!request.startTime) return "-";
  return `${request.startTime} - ${request.endTime}`;
}
