function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function formatKoreanDate(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function getReservationExamples(now = new Date()): string[] {
  const meetingDate = formatKoreanDate(addDays(now, 21));
  const practiceDate = formatKoreanDate(addDays(now, 22));
  const eventDate = formatKoreanDate(addDays(now, 24));

  return [
    `${meetingDate} 오후 6시부터 2시간 20명 율전 학생회 회의`,
    `${practiceDate} 14시부터 2시간 수원 동아리 연습`,
    `${eventDate} 오후 3시부터 2시간 50명 명륜 학술 세미나`,
  ];
}
