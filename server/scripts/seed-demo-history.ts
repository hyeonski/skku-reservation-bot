/**
 * 데모/테스트 시딩 — plausible한 대화·완료 예약 이력을 대량 생성한다.
 *
 * 목적:
 * - 후보 정렬(개인화) 기능: reservation_record.spaceCode 가 실제 space.gls_space_code 와
 *   일치하도록 채워 같은 슬롯/건물 반복 사용 → 상위 노출, rejected 피드백 → 하위 노출을 만든다.
 * - 반복성 예약 제안(reminder) 기능: 같은 patternKey(요일|시작|종료|단체|행사) 를 3회 이상
 *   반복하는 시리즈를 만들어 GET /reminders 가 후보를 생성하도록 한다.
 *
 * reminder/pattern_mute 는 read-time 생성이므로 시딩하지 않는다(클라가 /reminders 호출 시 생성).
 * 재실행 가능: 'de1' 접두 UUID 로 만든 시드 행만 지우고 다시 만든다(실제 대화 2건은 보존).
 *
 * 실행: npx tsx --env-file=.env scripts/seed-demo-history.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { summarizeReservationLabel } from '../src/application/state.js';
import { weekdayOf } from '../src/application/reminders.js';

const prisma = new PrismaClient();

// 실제 확장이 쓰는 기존 client. (override: SEED_CLIENT_ID 환경변수)
const CLIENT_ID = process.env.SEED_CLIENT_ID ?? '82a5946e-5ff9-4056-9b51-62d0cc19b4c3';
const SEED_PREFIX = 'de1'; // 시드 행 식별용 UUID 접두

// 결정론적 시드 UUID (재실행 시 동일 → upsert 로 치환). v4 포맷 유지.
function seedUuid(n: number): string {
  const h = n.toString(16).padStart(12, '0');
  return `de100000-0000-4000-8000-${h}`;
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

function fmtKDate(iso: string): string {
  const wd = weekdayOf(iso);
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}(${WEEKDAYS_KO[wd ?? 0]})`;
}

// KST 기준 ISO 타임스탬프 (Z 표기). base 일자 + 분 오프셋.
function ts(dateIso: string, hour: number, minute: number, addSec = 0): string {
  const base = new Date(`${dateIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`);
  return new Date(base.getTime() + addSec * 1000).toISOString();
}

function addDaysIso(dateIso: string, days: number): string {
  const ms = new Date(`${dateIso}T00:00:00Z`).getTime() + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

const HANGSA_LABELS: Record<string, string> = {
  '111': '학생회/동아리',
  '113': '세미나/스터디',
  '115': '보충수업/특강/시험',
  '116': '학과주관행사',
};

interface ResSpec {
  date: string;
  start: string;
  end: string;
  headcount: number;
  organization: string;
  eventName: string;
  purpose: string;
  hangsaGbCode: string;
  spaceCode: string;
  campusSlot: string; // 슬롯에 쓸 campus 표기 (명륜/율전 등)
  building: string;
}

// 화요일 저녁 알고리즘 스터디 (가장 최근 시리즈 → 리마인더로 부상, 같은 공간 반복 → 정렬 상위)
const TUE_DATES = ['2026-05-12', '2026-05-19', '2026-05-26', '2026-06-02', '2026-06-09', '2026-06-16'];
// 목요일 오후 학회 논문 세미나 (보조 시리즈)
const THU_DATES = ['2026-05-07', '2026-05-14', '2026-05-21', '2026-05-28'];
// 월요일 점심 동아리 정기회의
const MON_DATES = ['2026-05-11', '2026-05-18', '2026-05-25'];

const tueSeries: ResSpec[] = TUE_DATES.map((date) => ({
  date, start: '18:00', end: '20:00', headcount: 8,
  organization: '소프트웨어융합대학 코딩동아리', eventName: '알고리즘 스터디',
  purpose: '코딩 테스트 대비 알고리즘 문제 풀이 및 코드 리뷰', hangsaGbCode: '111',
  spaceCode: '26306', campusSlot: '율전', building: '제2공학관26동',
}));

const thuSeries: ResSpec[] = THU_DATES.map((date) => ({
  date, start: '15:00', end: '17:00', headcount: 12,
  organization: '데이터사이언스융합학과 학회', eventName: '논문 리뷰 세미나',
  purpose: '최신 논문 발제 및 토론', hangsaGbCode: '113',
  spaceCode: '31307', campusSlot: '명륜', building: '퇴계인문관',
}));

const monSeries: ResSpec[] = MON_DATES.map((date) => ({
  date, start: '12:00', end: '13:00', headcount: 10,
  organization: '밴드동아리 소리', eventName: '정기 회의',
  purpose: '공연 준비 및 곡 선정 회의', hangsaGbCode: '111',
  spaceCode: '50401', campusSlot: '명륜', building: '호암관',
}));

// 일회성 예약 (정렬 노이즈 + 다양성)
const oneOffs: ResSpec[] = [
  {
    date: '2026-06-13', start: '13:00', end: '17:00', headcount: 45,
    organization: '컴퓨터교육과 학생회', eventName: '신입생 학과 설명회',
    purpose: '신입생 대상 학과 커리큘럼 및 진로 안내', hangsaGbCode: '116',
    spaceCode: '50408', campusSlot: '명륜', building: '호암관',
  },
  {
    date: '2026-06-06', start: '18:00', end: '21:00', headcount: 55,
    organization: '소프트웨어융합대학 학생회', eventName: '신입생 환영회',
    purpose: '신입생 환영 및 선후배 교류', hangsaGbCode: '111',
    spaceCode: '26502', campusSlot: '율전', building: '제2공학관26동',
  },
  {
    date: '2026-05-29', start: '10:00', end: '12:00', headcount: 4,
    organization: '캡스톤 5팀', eventName: '졸업작품 회의',
    purpose: '졸업작품 중간 점검 회의', hangsaGbCode: '113',
    spaceCode: '33106C', campusSlot: '명륜', building: '경영관',
  },
  {
    date: '2026-05-22', start: '14:00', end: '16:00', headcount: 40,
    organization: '인공지능학과', eventName: '산업체 특강',
    purpose: '현직자 초청 AI 산업 동향 특강', hangsaGbCode: '115',
    spaceCode: '26110', campusSlot: '율전', building: '제2공학관26동',
  },
  {
    date: '2026-05-16', start: '15:00', end: '18:00', headcount: 12,
    organization: '바둑동아리', eventName: '교내 바둑 대회',
    purpose: '교내 회원 대상 바둑 토너먼트', hangsaGbCode: '111',
    spaceCode: '23242', campusSlot: '율전', building: '제1공학관23동',
  },
  {
    date: '2026-04-25', start: '13:00', end: '15:00', headcount: 30,
    organization: '경영학과 학생회', eventName: '전공 박람회',
    purpose: '전공 트랙 소개 및 상담 부스 운영', hangsaGbCode: '116',
    spaceCode: '61707', campusSlot: '명륜', building: '수선관',
  },
];

const completedSpecs = [...tueSeries, ...thuSeries, ...monSeries, ...oneOffs];

async function main() {
  console.log(`[seed] client = ${CLIENT_ID}`);

  // client 보장
  await prisma.client.upsert({
    where: { id: CLIENT_ID },
    update: {},
    create: { id: CLIENT_ID },
  });

  // --- 정리 (시드 행만) ---
  const delRec = await prisma.reservationRecord.deleteMany({ where: { conversationId: { startsWith: SEED_PREFIX } } });
  const delFb = await prisma.spaceFeedbackEvent.deleteMany({ where: { conversationId: { startsWith: SEED_PREFIX } } });
  const delConv = await prisma.conversation.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
  // reminder/mute 는 read-time 산출물 — 데모 클린 위해 client 전체 비움
  const delRem = await prisma.reminder.deleteMany({ where: { clientId: CLIENT_ID } });
  const delMute = await prisma.patternMute.deleteMany({ where: { clientId: CLIENT_ID } });
  console.log(`[seed] cleared: records=${delRec.count} feedback=${delFb.count} convs=${delConv.count} reminders=${delRem.count} mutes=${delMute.count}`);

  // 사용하는 공간 메타 로드 (라벨용)
  const codes = [...new Set(completedSpecs.map((s) => s.spaceCode))];
  const spaceRows = await prisma.space.findMany({
    where: { glsSpaceCode: { in: codes } },
    select: { glsSpaceCode: true, campusName: true, buildingName: true, roomName: true },
  });
  const spaceByCode = new Map(spaceRows.map((r) => [r.glsSpaceCode, r]));
  const missing = codes.filter((c) => !spaceByCode.has(c));
  if (missing.length) throw new Error(`space 테이블에 없는 코드: ${missing.join(', ')}`);

  let idx = 1;
  const backdates: { id: string; started: string; updated: string }[] = [];

  for (const spec of completedSpecs) {
    const convId = seedUuid(idx++);
    const space = spaceByCode.get(spec.spaceCode)!;
    const spaceLabel = `${space.buildingName} ${space.roomName.replace(/^\[[^\]]+\]\s*/, '')}`;
    const weekday = weekdayOf(spec.date)!;
    const form = {
      hangsaGbCode: spec.hangsaGbCode,
      organization: spec.organization,
      eventName: spec.eventName,
      headcount: spec.headcount,
      purpose: spec.purpose,
    };
    const label = summarizeReservationLabel(form);
    const hangsaLabel = HANGSA_LABELS[spec.hangsaGbCode] ?? '기타';
    const durationMin =
      (Number(spec.end.slice(0, 2)) * 60 + Number(spec.end.slice(3))) -
      (Number(spec.start.slice(0, 2)) * 60 + Number(spec.start.slice(3)));

    // 예약 완료 시각 = 행사일 4일 전 13시경(현실적 선예약). 대화도 그 시점에.
    const bookDate = addDaysIso(spec.date, -4);
    const startedAt = ts(bookDate, 13, 2);
    const t = (i: number) => ts(bookDate, 13, 2, i * 47);

    const history = [
      { ts: t(0), role: 'user', content: `${fmtKDate(spec.date)} ${spec.start.replace(':00', '시')}부터 ${Math.round(durationMin / 60)}시간 ${spec.headcount}명 ${spec.campusSlot} ${spec.eventName}` },
      { ts: t(1), role: 'assistant', content: `${fmtKDate(spec.date)} ${spec.start}부터 ${spec.headcount}명, ${spec.campusSlot} ${spec.building}으로 가능한 공간을 찾아볼게요.` },
      { ts: t(2), role: 'user', content: `${spec.organization} ${spec.eventName}야` },
      { ts: t(3), role: 'assistant', content: `${spec.organization}의 ${spec.eventName}(으)로 신청서를 채웠어요. ${spaceLabel}(${spec.spaceCode})이 가능한데 이 공간으로 진행할까요?` },
      { ts: t(4), role: 'user', content: '응 그걸로 예약해줘' },
      { ts: t(5), role: 'assistant', content: `${spaceLabel}(${spec.spaceCode})으로 예약을 진행할게요. 신청서를 제출했습니다.` },
    ];

    const lastFilledSlots = {
      date: spec.date,
      start_time: spec.start,
      end_time: spec.end,
      duration_min: durationMin,
      headcount: spec.headcount,
      campus: spec.campusSlot,
      building: spec.building,
      space: spec.spaceCode,
    };
    const lastApplicationState = {
      draft: form,
      missing_application: [],
      needs_application_collection: false,
      suggested_memory: null,
      recommendation: null,
      confidence: { organization: 'high', eventName: 'high', purpose: 'medium', hangsaGbCode: 'medium' },
      source: 'conversation',
    };

    await prisma.conversation.create({
      data: {
        id: convId,
        client: { connect: { id: CLIENT_ID } },
        status: 'completed',
        title: `${fmtKDate(spec.date)} ${spec.campusSlot} ${spec.eventName}`,
        history: history as unknown as Prisma.InputJsonValue,
        lastFilledSlots: lastFilledSlots as Prisma.InputJsonValue,
        lastApplicationState: lastApplicationState as Prisma.InputJsonValue,
        confirmedReservationForm: form as Prisma.InputJsonValue,
        confirmedReservationLabel: label,
        confirmedSpaceCode: spec.spaceCode,
        confirmedSpaceLabel: spaceLabel,
        completedAt: new Date(t(5)),
      },
    });

    await prisma.reservationRecord.create({
      data: {
        id: seedUuid(10000 + idx),
        client: { connect: { id: CLIENT_ID } },
        conversationId: convId,
        date: spec.date,
        weekday,
        startTime: spec.start,
        endTime: spec.end,
        headcount: spec.headcount,
        organization: spec.organization,
        eventName: spec.eventName,
        purpose: spec.purpose,
        hangsaGbCode: spec.hangsaGbCode,
        spaceCode: spec.spaceCode,
        spaceLabel,
        reservedAt: new Date(startedAt),
        createdAt: new Date(startedAt),
      },
    });

    backdates.push({ id: convId, started: startedAt, updated: t(5) });
  }

  // @updatedAt/@default(now) 컬럼 backdate (Prisma create 가 now() 로 덮어쓰므로 raw 로 보정)
  for (const b of backdates) {
    await prisma.$executeRaw`UPDATE conversation SET started_at = ${new Date(b.started)}, updated_at = ${new Date(b.updated)} WHERE id = ${b.id}`;
  }

  // --- 미완료 대화(active/abandoned) — 목록 다양성 ---
  const drafts = [
    {
      n: 500, status: 'active', date: '2026-06-18',
      title: '7월 3일 율전 해커톤 장소',
      msgs: [
        ['user', '7월 3일 종일 해커톤 할 큰 공간 찾아줘 100명 정도'],
        ['assistant', '7/3(금) 종일 100명 규모 공간을 찾아볼게요. 캠퍼스는 율전이 맞을까요?'],
        ['user', '응 율전'],
        ['assistant', '율전에서 100명 수용 가능한 공간을 찾고 있어요. 잠시만요.'],
      ],
    },
    {
      n: 501, status: 'abandoned_user', date: '2026-06-10',
      title: '명륜 스터디룸 문의',
      msgs: [
        ['user', '내일 오후에 4명 스터디할 곳'],
        ['assistant', '내일(6/11) 오후 4명 스터디 공간을 찾아볼게요. 시작 시간은 언제가 좋을까요?'],
      ],
    },
    {
      n: 502, status: 'active', date: '2026-06-19',
      title: '동아리 MT 사전 모임',
      msgs: [
        ['user', '6월 25일 저녁 7시 동아리 엠티 사전모임 20명'],
        ['assistant', '6/25(목) 19:00 20명 사전모임 공간을 찾아볼게요. 어느 캠퍼스인가요?'],
        ['user', '율전으로'],
        ['assistant', '율전에서 20명 가능한 공간을 찾는 중이에요.'],
      ],
    },
  ];
  for (const d of drafts) {
    const convId = seedUuid(d.n);
    const startedAt = ts(d.date, 21, 10);
    const history = d.msgs.map(([role, content], i) => ({ ts: ts(d.date, 21, 10, i * 40), role, content }));
    await prisma.conversation.create({
      data: {
        id: convId,
        client: { connect: { id: CLIENT_ID } },
        status: d.status as 'active' | 'abandoned_user',
        title: d.title,
        history: history as unknown as Prisma.InputJsonValue,
      },
    });
    const lastTs = ts(d.date, 21, 10, (d.msgs.length - 1) * 40);
    await prisma.$executeRaw`UPDATE conversation SET started_at = ${new Date(startedAt)}, updated_at = ${new Date(lastTs)} WHERE id = ${convId}`;
  }

  // --- 공간 거절 피드백 (정렬 down-rank 테스트) ---
  // 화요일 저녁 슬롯에서 큰 강의실 후보를 반복 거절 → 같은 슬롯 검색 시 하위로.
  const feedback = [
    { n: 700, spaceCode: '26502', date: '2026-06-09', startTime: '18:00', convN: 5 },
    { n: 701, spaceCode: '26502', date: '2026-06-02', startTime: '18:00', convN: 4 },
    { n: 702, spaceCode: '26110', date: '2026-06-16', startTime: '18:00', convN: 6 },
    { n: 703, spaceCode: '50408', date: '2026-05-28', startTime: '15:00', convN: 10 },
    { n: 704, spaceCode: '61707', date: '2026-05-21', startTime: '15:00', convN: 9 },
  ];
  for (const f of feedback) {
    await prisma.spaceFeedbackEvent.create({
      data: {
        id: seedUuid(f.n),
        client: { connect: { id: CLIENT_ID } },
        conversationId: seedUuid(f.convN),
        spaceCode: f.spaceCode,
        eventType: 'rejected_candidate',
        date: f.date,
        startTime: f.startTime,
        createdAt: new Date(ts(addDaysIso(f.date, -4), 13, 5)),
      },
    });
  }

  // --- 요약 ---
  const [convs, completed, recs, fb] = await Promise.all([
    prisma.conversation.count({ where: { clientId: CLIENT_ID, deletedAt: null } }),
    prisma.conversation.count({ where: { clientId: CLIENT_ID, status: 'completed' } }),
    prisma.reservationRecord.count({ where: { clientId: CLIENT_ID } }),
    prisma.spaceFeedbackEvent.count({ where: { clientId: CLIENT_ID } }),
  ]);
  console.log(`[seed] done. conversations=${convs} (completed=${completed}) reservationRecords=${recs} feedbackEvents=${fb}`);
  console.log('[seed] 반복 패턴: 화 18:00-20:00 알고리즘 스터디 ×6 (최근→리마인더), 목 15:00-17:00 학회 세미나 ×4, 월 12:00-13:00 동아리 회의 ×3');
  console.log('[seed] GET /reminders 호출 시 다음 화요일(2026-06-23) 알고리즘 스터디 제안이 생성됩니다.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
