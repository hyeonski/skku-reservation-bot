import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const scrapedAt = new Date();

const e2eSpaces = [
  {
    glsSpaceCode: '400126',
    campusCode: '2',
    buildingNo: '240',
    campusName: '자연과학캠퍼스',
    buildingName: '반도체관',
    roomName: '첨단강의실',
    capacityMin: 40,
    capacityMax: 120,
    useJojikName: '정보통신/소프트웨어융합/공과대학행정실',
    adminJojikName: '정보통신/소프트웨어융합/공과대학행정실',
    contents: '반도체관 첨단강의실 — 대형 강의·행사 후보.',
  },
  {
    glsSpaceCode: '23413',
    campusCode: '1',
    buildingNo: '23',
    campusName: '인문사회과학캠퍼스',
    buildingName: '수선관',
    roomName: '세미나실',
    capacityMin: 1,
    capacityMax: 24,
    useJojikName: '정보통신/소프트웨어융합/공과대학행정실',
    adminJojikName: '정보통신/소프트웨어융합/공과대학행정실',
    contents: '수선관 세미나실 — 소규모 회의 후보.',
  },
  {
    glsSpaceCode: '85529',
    campusCode: '2',
    buildingNo: '85',
    campusName: '자연과학캠퍼스',
    buildingName: '산학협력센터',
    roomName: '세미나실 I',
    capacityMin: 1,
    capacityMax: 20,
    useJojikName: '산학협력센터',
    adminJojikName: '산학협력센터',
    contents: '산학협력센터 세미나실 — 소규모 세미나 후보.',
  },
  {
    glsSpaceCode: '03B08',
    campusCode: '2',
    buildingNo: '03',
    campusName: '자연과학캠퍼스',
    buildingName: '학생회관',
    roomName: '연습실',
    capacityMin: 1,
    capacityMax: 32,
    useJojikName: '학생지원팀',
    adminJojikName: '학생지원팀',
    contents: '율전 학생회관 연습실 — 동아리 연습 후보.',
  },
  {
    glsSpaceCode: '26305',
    campusCode: '2',
    buildingNo: '26',
    campusName: '자연과학캠퍼스',
    buildingName: '제2공학관',
    roomName: '학생 참여형 플립러닝 강의실',
    capacityMin: 1,
    capacityMax: 32,
    useJojikName: '공과대학행정실',
    adminJojikName: '공과대학행정실',
    contents: '제2공학관 플립러닝 강의실 — 강의·워크숍 후보.',
  },
  {
    glsSpaceCode: '50304',
    campusCode: '2',
    buildingNo: '50',
    campusName: '자연과학캠퍼스',
    buildingName: '의학관',
    roomName: '강의실',
    capacityMin: 1,
    capacityMax: 40,
    useJojikName: '의과대학행정실',
    adminJojikName: '의과대학행정실',
    contents: '의학관 강의실 — 중규모 강의 후보.',
  },
  {
    glsSpaceCode: '32425D',
    campusCode: '1',
    buildingNo: '32',
    campusName: '인문사회과학캠퍼스',
    buildingName: '경영관',
    roomName: '세미나실4',
    capacityMin: 1,
    capacityMax: 40,
    useJojikName: '경영대학행정실',
    adminJojikName: '경영대학행정실',
    contents: '경영관 세미나실 — 중규모 세미나 후보.',
  },
];

async function main(): Promise<void> {
  for (const space of e2eSpaces) {
    await prisma.space.upsert({
      where: { glsSpaceCode: space.glsSpaceCode },
      create: {
        ...space,
        useJojikCode: null,
        adminJojikCode: null,
        limitDayYn: false,
        limitDay: null,
        limitTimeYn: false,
        limitTimeHHMM: null,
        daeyeoGb: '1',
        scrapedAt,
        active: true,
      },
      update: {
        ...space,
        scrapedAt,
        active: true,
      },
    });
  }

  console.log(`Seeded ${e2eSpaces.length} demo spaces`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
