/**
 * @file index.js
 * @desc Express 앱 진입점. 미들웨어 → 라우터 → Socket.io → DB 동기화 순으로 기동합니다.
 */

require("dotenv").config();

const http         = require("http");
const express      = require("express");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const morgan       = require("morgan");

const { notFoundHandler, globalErrorHandler } = require("./middleware/errorHandler");
const authRouter     = require("./routes/auth.routes");
const friendRouter   = require("./routes/friend.routes");
const { initSocket } = require("./socket/socket");
const db             = require("./models");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
// 리버스 프록시(Nginx, ELB) 환경에서 x-forwarded-for 헤더로 실제 IP를 읽기 위함
app.set("trust proxy", 1);

app.use("/auth",    authRouter);
app.use("/friends", friendRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

// Socket.io는 raw http 서버에 부착해야 하므로 http.createServer로 감쌈
const server = http.createServer(app);
initSocket(server);

const port = Number(process.env.PORT) || 4000;

db.sequelize.sync({ force: false })
  .then(() => {
    console.log("✅ MySQL DB 연결 및 테이블 동기화 완료!");
    server.listen(port, () => {
      console.log(`🚀 Backend listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ DB 연결 실패:", err);
  });
