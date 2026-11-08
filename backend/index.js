// 서버 시작 파일, Express 앱 + socket.io를 http 서버에 붙이고 DB 표 준비 확인 뒤 열기
// npm start·dev가 돌림, 시험이 require해 씀 (시작 로그·종료 코드를 시험이 봄)
require("dotenv").config();

const http         = require("http");
const express      = require("express");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const morgan       = require("morgan");

// 시작 실패: 이유를 한 줄로 줄여 남기고 종료 코드 1 (스택 트레이스는 안 찍음)
const failStartup = (error, label = "DB 연결") => {
    const reason = String(error?.message ?? error ?? "unknown error")
        .replace(/\s+/g, " ")
        .trim();
    console.error(`[STARTUP] 실패 — ${label}: ${reason}`);
    process.exit(1);
};

// 직접 켤 때(npm start·docker·pm2)만 로그 파일·종료 처리 붙임 (시험이 require할 땐 안 붙임)
const isMain = require.main === module;
const logFile = isMain ? require("./utils/logFile").createLogFileFromEnv() : null;
if (logFile) require("./utils/logFile").teeConsoleToLogFile(logFile);

// 필수 환경값: 운영은 비면 시작 거부, 개발은 경고만 (로컬 .env 덜 채워도 켜지게)
try {
    require("./config/requiredEnv").assertRequiredEnv();
    // 서명 키가 짧거나 예시 값이면 운영은 시작 거부 (토큰 위조 막기)
    require("./config/requiredEnv").assertStrongSecrets();
} catch (error) {
    if (require("./config/requiredEnv").isStartupFatal(error)) failStartup(error, "환경값"); // 운영 + 모르는 NODE_ENV는 거부
    console.warn(`[STARTUP] 경고 — ${error.message} (개발이라 계속, 운영이면 시작 거부)`);
}

// 토스 키 상태: 운영인데 시험 키면 돈이 안 들어와 경고만 (N-7, 키 값은 안 찍음)
const tossKeyWarning = require("./utils/adapters/toss").describeKeyWarning();
if (tossKeyWarning) console.warn(`[STARTUP] 경고 — ${tossKeyWarning}`);

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
const reportRouter   = require("./routes/report.routes");
const internalRouter = require("./routes/internal.routes");
const { initSocket } = require("./socket/socket");
const { getCorsOrigin } = require("./config/frontendOrigins");

const app = express();

// 모든 응답에 기본 보안 헤더 (Express 이름 헤더 빼기)
app.use(require("./middlewares/securityHeaders.middleware").securityHeaders);
// 프런트 주소(데스크톱·모바일 목록)에서만 쿠키 실은 요청 받음
app.use(cors({ origin: getCorsOrigin(), credentials: true }));

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

// 본문 읽기: 100kb 제한·읽기 실패는 코드만·__proto__ 같은 키 거절 (보안 점검 2026-11-09)
for (const middleware of require("./middlewares/bodyGuard.middleware").bodyGuards()) app.use(middleware);
app.use(cookieParser());
// 상태 확인은 요청 로그 앞 (docker healthcheck가 30초마다 불러 로그 안 채우게)
app.use("/health", require("./routes/health.routes"));
// 요청 로그 주소: 비번 재설정·가입 경로는 뒤를 가림, 나머지는 쿼리 뺀 경로만 (토큰·이메일이 로그에 안 남게)
morgan.token("safe-url", (req) => (
    isPasswordResetPath(req) ? "/auth/password-reset/[REDACTED]"
        : isSignupPath(req) ? "/auth/signup/[REDACTED]"
        : require("./utils/request").safeRequestPath(req)
));
// 로그 파일 있으면 화면·파일 둘 다
app.use(morgan(":method :safe-url :status :response-time ms", logFile ? {
    stream: { write: (line) => { process.stdout.write(line); logFile.write(line); } },
} : undefined));
// 프록시 한 단계 뒤에 있다고 보고 req.ip를 정함
app.set("trust proxy", 1);

// 경로 묶음마다 라우터
app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/friends", friendRouter);
app.use("/game", gameRouter);
app.use("/economy", economyRouter);
app.use("/notifications", notificationRouter);
app.use("/reports", reportRouter);
// 관리자 서버 전용 (INTERNAL_API_KEY 없으면 꺼짐)
app.use("/internal", internalRouter);

// 라우터 뒤: 없는 경로 404 → 마지막 오류 처리
app.use(notFoundHandler);
app.use(globalErrorHandler);

// http 서버 하나에 Express와 socket.io를 같이 붙임
const server = http.createServer(app);
const io = initSocket(server, { corsOrigin: getCorsOrigin() });

const port = Number(process.env.PORT) || 4000;

// 종료 신호·예상 못 한 오류: 새 연결 막고 점검 안내 → 소켓·DB 닫고 종료 (다시 켜기는 docker·pm2)
if (isMain) {
    const { createShutdown, installProcessHandlers } = require("./utils/processLifecycle");
    installProcessHandlers({
        shutdown: createShutdown({ server, io, closeDb: () => db.sequelize.close(), logFile }),
    });
}

// 표는 마이그레이션만 만듦 (모델대로 만드는 sync는 안 씀, 마이그레이션이 건너뛰어 모양이 갈림)
// 연결 + 마이그레이션 이력 확인 → 성공해야 포트 열기 (운영은 안 돌린 게 있으면 시작 거부)
// 시험이 바꿔 끼울 수 있게 모듈 객체로 부름
const schemaReadiness = require("./db/schemaReadiness");
schemaReadiness.ensureSchemaReady(db.sequelize)
    .then(() => {
        // 점검·금지어 한 번 읽기 (표 없거나 실패해도 서버는 켬, 꺼짐·빈 목록으로 시작)
        require("./services/ops/maintenance").reloadMaintenance()
            .catch((err) => console.warn("[STARTUP] 점검 상태 못 읽음 —", err?.name ?? "Error"));
        // 재시작 전 남은 ONLINE 줄을 OFFLINE으로 (BE-015, 포트 열기 전 시각 기준이라 새로 붙은 사람은 안 덮음)
        require("./services/presence/status").resetPresencesOnBoot(new Date())
            .catch((err) => console.warn("[STARTUP] 접속 상태 못 되돌림 —", err?.name ?? "Error"));
        require("./services/ops/bannedWords").reloadBannedWords()
            .catch((err) => console.warn("[STARTUP] 금지어 못 읽음 —", err?.name ?? "Error"));
        const pool = db.sequelize.options.pool ?? {};
        server.listen(port, () => {
            console.log(
                `[STARTUP] 성공 — port=${port} DB 연결·마이그레이션 확인 완료; pool max=${pool.max} min=${pool.min} idle=${pool.idle}ms acquire=${pool.acquire}ms`
            );
        });
    })
    .catch((err) => {
        failStartup(err, err?.code === schemaReadiness.SCHEMA_NOT_READY ? "DB 표 준비 안 됨" : "DB 연결");
    })

module.exports = { app, server, io };
