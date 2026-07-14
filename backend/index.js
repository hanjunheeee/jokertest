// .env 파일의 환경변수를 로드합니다. 다른 require보다 먼저 실행되야
// 아래 코드에서 process.env 값을 쓸 수 있습니다.
require("dotenv").config();

// Express는 Node.js에서 서버와 API를 쉽게 만들게 해주는 라이브러리입니다.
const http         = require("http");
const express      = require("express");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const morgan       = require("morgan");

const { notFoundHandler, globalErrorHandler } = require("./middleware/errorHandler");
const authRouter     = require("./routes/auth.routes");
const userRouter     = require("./routes/user.routes");
const friendRouter   = require("./routes/friend.routes");
const { initSocket } = require("./socket/socket");

// app은 Express 서버 객체입니다. 앞으로 라우터, 미들웨어, 서버 실행 설정을 여기에 붙입니다.
const app = express();

// ./models/index.js를 불러옵니다.
// 이 안에는 Sequelize 연결 객체와 모델들이 들어 있습니다.
const db = require("./models");

// 프론트(5173)에서 쿠키 기반 인증 요청을 보낼 수 있도록 origin과 credentials를 함께 허용합니다.
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
// 리버스 프록시(Nginx 등) 환경에서 x-forwarded-for 헤더로 실제 클라이언트 IP를 읽기 위함
app.set("trust proxy", 1);

app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/friends", friendRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

// Socket.io는 raw http 서버에 부착해야 하므로 http.createServer로 감쌉니다.
const server = http.createServer(app);
initSocket(server);

// .env에 PORT가 없으면 4000번을 기본값으로 사용합니다.
const port = Number(process.env.PORT) || 4000;

// Sequelize가 DB에 연결한 뒤, 현재 정의된 모델 기준으로 테이블을 동기화합니다.
// force: false는 기존 테이블을 삭제하지 않고 필요한 동기화만 시도한다는 뜻입니다.
db.sequelize.sync({force: false})
    .then(() => {
        // DB 연결과 테이블 동기화가 성공했을 때 실행됩니다.
        console.log("MySQL DB 연결 및 테이블 동기화 완료");

        // DB 준비가 끝난 뒤에 Express 서버를 실행합니다.
        // 이렇게 하면 DB 연결 실패 상태에서 서버만 켜지는 상황을 막을 수 있습니다.
        server.listen(port, () => {
            console.log(`Backend listening on http://localhost:${port}`)
        });
    })
    .catch((err) => {
        // DB 연결이나 테이블 동기화 중 에러가 나면 여기서 잡힙니다.
        console.error("DB 연결 실패:", err);
    })
