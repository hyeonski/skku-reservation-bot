const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function formatKoreanDate(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${WEEKDAYS[date.getDay()]})`;
}

export function getReservationExamples(now = new Date()): string[] {
  const meetingDate = formatKoreanDate(addDays(now, 21));
  const practiceDate = formatKoreanDate(addDays(now, 22));
  const eventDate = formatKoreanDate(addDays(now, 24));

  return [
    `${meetingDate} 오후 6시부터 2시간 20명 학생회 회의`,
    `${practiceDate} 14시부터 2시간 동아리 연습`,
    `${eventDate} 오후 3시부터 2시간 50명 학술 세미나`,
  ];
}
