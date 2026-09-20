// .env 파일의 환경변수를 로드합니다. 다른 require보다 먼저 실행되야
// 아래 코드에서 process.env 값을 쓸 수 있습니다.
require("dotenv").config();

// Express는 Node.js에서 서버와 API를 쉽게 만들게 해주는 라이브러리입니다.
const http         = require("http");
const express      = require("express");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const morgan       = require("morgan");

const failStartup = (error) => {
    const reason = String(error?.message ?? error ?? "unknown error")
        .replace(/\s+/g, " ")
        .trim();
    console.error(`[STARTUP] 실패 — DB 연결: ${reason}`);
    process.exit(1);
};

// 모델 초기화는 라우터/서비스 import보다 먼저 수행합니다. 일부 라우터가 models를
// 간접 import하므로, 이 경계가 먼저 있어야 잘못된 URL에서 발생하는 Sequelize 생성자
// 동기 throw와 이후 sync() reject를 동일한 실패 로그/종료 코드로 처리할 수 있습니다.
let db;
try {
    db = require("./models");
} catch (error) {
    failStartup(error);
}

const { notFoundHandler, globalErrorHandler } = require("./middleware/errorHandler");
const authRouter     = require("./routes/auth.routes");
const userRouter     = require("./routes/user.routes");
const friendRouter   = require("./routes/friend.routes");
const gameRouter     = require("./routes/game.routes");
const economyRouter  = require("./routes/economy.routes");
// F-17: 알림 목록 조회·읽음. 아래에서 오류 미들웨어보다 **먼저** 등록해야 404/401/400이
// 기존 globalErrorHandler의 같은 응답 형태로 나간다.
const notificationRouter = require("./routes/notification.routes");
const { initSocket } = require("./socket/socket");

// app은 Express 서버 객체입니다. 앞으로 라우터, 미들웨어, 서버 실행 설정을 여기에 붙입니다.
const app = express();

// 프론트(5173)에서 쿠키 기반 인증 요청을 보낼 수 있도록 origin과 credentials를 함께 허용합니다.
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
// 리버스 프록시(Nginx 등) 환경에서 x-forwarded-for 헤더로 실제 클라이언트 IP를 읽기 위함
app.set("trust proxy", 1);

// F-29a: authRouter가 등록하는 POST /auth/find-id(아이디 찾기)를 포함해, 인증 관련 공개·
// 보호 경로 전부가 이 마운트 하나를 통해 실제로 요청을 받는다 — backend/__tests__/dbStartup.test.js
// 의 "정상 기동 후 REST 요청과 소켓 핸드셰이크가 동작한다"가 이 app 인스턴스를 실제로 기동해
// GET /auth/me(같은 authRouter가 등록)가 401로 응답하는 것으로 이 마운트 경로 자체를 검증한다.
app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/friends", friendRouter);
app.use("/game", gameRouter);
app.use("/economy", economyRouter);
app.use("/notifications", notificationRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

// Socket.io는 raw http 서버에 부착해야 하므로 http.createServer로 감쌉니다.
const server = http.createServer(app);
// 반환된 io는 테스트에서 붙어 있는 소켓과 타이머를 정리(io.close())하는 데 씁니다.
const io = initSocket(server);

// .env에 PORT가 없으면 4000번을 기본값으로 사용합니다.
const port = Number(process.env.PORT) || 4000;

// Sequelize가 DB에 연결한 뒤, 현재 정의된 모델 기준으로 테이블을 동기화합니다.
// force: false는 기존 테이블을 삭제하지 않고 필요한 동기화만 시도한다는 뜻입니다.
db.sequelize.sync({force: false})
    .then(() => {
        // DB 연결과 테이블 동기화가 성공했을 때 실행됩니다.
        // 실제로 적용된 풀 값을 함께 찍어, 기동 로그만 보고도 max/min/idle/acquire가
        // 의도한 값으로 들어갔는지 확인할 수 있게 합니다.
        const pool = db.sequelize.options.pool ?? {};
        // DB 준비가 끝난 뒤에 Express 서버를 실행합니다.
        // 이렇게 하면 DB 연결 실패 상태에서 서버만 켜지는 상황을 막을 수 있습니다.
        server.listen(port, () => {
            console.log(
                `[STARTUP] 성공 — port=${port} DB 연결·동기화 완료; pool max=${pool.max} min=${pool.min} idle=${pool.idle}ms acquire=${pool.acquire}ms`
            );
        });
    })
    .catch((err) => {
        // DB 연결이나 테이블 동기화 중 에러가 나면 여기서 잡힙니다.
        // err를 통째로 넘기면 스택이 여러 줄로 퍼져 성공/실패 로그의 경계가 흐려지므로,
        // 원인은 message 한 줄로만 남깁니다.
        failStartup(err);
    })

// 이 파일은 서버 실행 진입점이지만, 테스트에서 기동 후 정리(server.close/io.close)를
// 할 수 있도록 핸들만 함께 내보냅니다. require 시점의 동작은 달라지지 않습니다.
module.exports = { app, server, io };
