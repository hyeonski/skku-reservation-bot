import "dotenv/config";

const REQUIRED_ENV = [
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE",
  "OPENAI_API_KEY",
  "OPENAI_MODEL"
];

const missing = REQUIRED_ENV.filter((key) => !String(process.env[key] ?? "").trim());

console.log("교내 예약 서버 설정 점검");
console.log("네트워크, DB, LLM API에는 접속하지 않습니다.");

if (missing.length > 0) {
  console.log("");
  console.log("채워야 할 값:");
  for (const key of missing) console.log(`- ${key}`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("필수 환경변수가 모두 채워져 있습니다.");
  console.log("다음 단계: npm run dev");
}
