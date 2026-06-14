/**
 * @file    index.js
 * @desc    Express 애플리케이션의 진입점(Entry Point)입니다.
 *          환경변수 로드 → 미들웨어 등록 → 라우터 연결 → DB 동기화 → 서버 기동 순서로 실행됩니다.
 *
 * ┌─────────────────────────────────────────────────┐
 * │  요청 흐름 (Request Pipeline)                    │
 * │                                                 │
 * │  Client → CORS → JSON Parser → Cookie Parser   │
 * │         → Morgan (로그) → Router → Controller  │
 * │         → Service → Repository → DB            │
 * │         → 에러 핸들러 → Client                  │
 * └─────────────────────────────────────────────────┘
 */

// ──────────────────────────────────────────────
// 1. 환경변수 & 외부 모듈
// ──────────────────────────────────────────────
const dotenv  = require("dotenv");
dotenv.config(); // .env 파일의 환경변수를 process.env에 주입

const express      = require("express");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const morgan       = require("morgan"); // HTTP 요청을 터미널에 색깔 있게 출력해주는 로거

// ──────────────────────────────────────────────
// 2. 내부 모듈 (라우터 · 미들웨어 · DB)
// ──────────────────────────────────────────────
const { notFoundHandler, globalErrorHandler } = require("./middleware/errorHandler");
const authRouter   = require("./routes/auth.routes");
const friendRouter = require("./routes/friend.routes");
const db           = require("./models");

// ──────────────────────────────────────────────
// 3. Express 앱 인스턴스 생성
// ──────────────────────────────────────────────
const app = express();

// ──────────────────────────────────────────────
// 4. 전역 미들웨어 등록
// ──────────────────────────────────────────────

/**
 * CORS 설정
 * .env의 FRONTEND_URL 출처에서 오는 요청만 허용하고, 쿠키(credentials) 전송을 허용합니다.
 */
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
}));

app.use(express.json());                  // JSON 형식의 요청 바디를 파싱해 req.body에 담아줌
app.use(express.urlencoded({ extended: true })); // URL-encoded 형식 바디도 파싱 (폼 데이터 등)
app.use(cookieParser());                  // 쿠키 문자열을 파싱해 req.cookies 객체로 접근할 수 있게 해줌
app.use(morgan("dev"));                   // 개발 모드 로그: [메서드] [경로] [상태코드] [응답시간] 출력

/**
 * 프록시 신뢰 설정
 * Nginx, AWS ELB 등 리버스 프록시 뒤에 서버가 있을 때
 * x-forwarded-for 헤더를 읽어 클라이언트의 실제 IP를 req.ip에 담아줍니다.
 */
app.set("trust proxy", 1);

// ──────────────────────────────────────────────
// 5. API 라우터 등록
// ──────────────────────────────────────────────
app.use("/auth",    authRouter);   // 인증 관련 API  : /auth/login, /auth/signup, /auth/me
app.use("/friends", friendRouter); // 친구 관련 API  : /friends/, /friends/search, /friends/requests ...

// ──────────────────────────────────────────────
// 6. 에러 핸들링 미들웨어 (반드시 라우터 등록 이후에 위치해야 함)
// ──────────────────────────────────────────────
app.use(notFoundHandler);    // 위의 어떤 라우터에도 매칭되지 않으면 404 응답
app.use(globalErrorHandler); // next(error)로 넘어온 모든 에러를 최종 처리

// ──────────────────────────────────────────────
// 7. DB 동기화 & 서버 기동
// ──────────────────────────────────────────────
const port = Number(process.env.PORT) || 4000;

/**
 * Sequelize를 통해 DB와 모델을 동기화한 뒤 서버를 기동합니다.
 *
 * @param force  {boolean} true → 서버 기동 시 모든 테이블 DROP 후 재생성 (데이터 초기화 주의!)
 *                         false → 기존 테이블을 그대로 유지
 * @param alter  {boolean} true → 기존 테이블에 컬럼 변경사항만 반영 (데이터 유지)
 *
 * ⚠️  개발 중 스키마 변경 후에만 force: true 사용. 확인 후 반드시 false로 되돌릴 것.
 */
db.sequelize.sync({ force: true })
  .then(() => {
    console.log("✅ MySQL DB 연결 및 테이블 동기화 완료!");
    app.listen(port, () => {
      console.log(`🚀 Backend listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ DB 연결 실패:", err);
  });
