// 서버 시작 파일, Express 앱 + socket.io를 http 서버에 붙이고 DB 동기화 뒤 열기
// npm start·dev가 돌림, 시험이 require해 씀 (시작 로그·종료 코드를 시험이 봄)
require("dotenv").config();

const http         = require("http");
const express      = require("express");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const morgan       = require("morgan");

// 시작 실패: 이유를 한 줄로 줄여 남기고 종료 코드 1 (스택 트레이스는 안 찍음)
const failStartup = (error) => {
    const reason = String(error?.message ?? error ?? "unknown error")
        .replace(/\s+/g, " ")
        .trim();
    console.error(`[STARTUP] 실패 — DB 연결: ${reason}`);
    process.exit(1);
};

// 모델 불러오기부터 실패할 수 있음 (DB 주소 없음 등)
let db;
try {
    db = require("./models");
} catch (error) {
    failStartup(error);
}

const { notFoundHandler, globalErrorHandler } = require("./middlewares/errorHandler.middleware");
const authRouter     = require("./routes/auth.routes");
const userRouter     = require("./routes/user.routes");
const friendRouter   = require("./routes/friend.routes");
const gameRouter     = require("./routes/game.routes");
const economyRouter  = require("./routes/economy.routes");
const notificationRouter = require("./routes/notification.routes");
const { initSocket } = require("./socket/socket");

const app = express();

// 프런트 주소에서만 쿠키 실은 요청 받음
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

// 비번 재설정·가입 경로인지 (뒤 슬래시·쿼리 빼고 소문자로 봄)
const isPasswordResetPath = (req) => String(req.originalUrl || req.url || '')
    .split('?')[0].replace(/\/+$/, '').toLowerCase().startsWith('/auth/password-reset');
const isSignupPath = (req) => String(req.originalUrl || req.url || '')
    .split('?')[0].replace(/\/+$/, '').toLowerCase().startsWith('/auth/signup');
// 비번 재설정·가입 응답은 브라우저·프록시가 저장 못 하게
app.use((req, res, next) => {
    if (isPasswordResetPath(req) || isSignupPath(req)) res.set('Cache-Control', 'no-store');
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// 요청 로그 주소: 비번 재설정·가입 경로는 뒤를 가림 (토큰·이메일이 로그에 안 남게)
morgan.token("safe-url", (req) => (
    isPasswordResetPath(req) ? "/auth/password-reset/[REDACTED]"
        : isSignupPath(req) ? "/auth/signup/[REDACTED]"
        : (req.originalUrl || req.url)
));
app.use(morgan(":method :safe-url :status :response-time ms"));
// 프록시 한 단계 뒤에 있다고 보고 req.ip를 정함
app.set("trust proxy", 1);

// 경로 묶음마다 라우터
app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/friends", friendRouter);
app.use("/game", gameRouter);
app.use("/economy", economyRouter);
app.use("/notifications", notificationRouter);

// 라우터 뒤: 없는 경로 404 → 마지막 오류 처리
app.use(notFoundHandler);
app.use(globalErrorHandler);

// http 서버 하나에 Express와 socket.io를 같이 붙임
const server = http.createServer(app);
const io = initSocket(server);

const port = Number(process.env.PORT) || 4000;

// 없는 표만 모델대로 만듦 (있는 표는 안 바꿈, 표 바꾸기는 마이그레이션 몫) → 성공해야 포트 열기
db.sequelize.sync({force: false})
    .then(() => {
        const pool = db.sequelize.options.pool ?? {};
        server.listen(port, () => {
            console.log(
                `[STARTUP] 성공 — port=${port} DB 연결·동기화 완료; pool max=${pool.max} min=${pool.min} idle=${pool.idle}ms acquire=${pool.acquire}ms`
            );
        });
    })
    .catch((err) => {
        failStartup(err);
    })

module.exports = { app, server, io };
