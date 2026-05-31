const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const morgan = require("morgan");

const { notFoundHandler, globalErrorHandler } = require("./middleware/errorHandler")
const authRouter = require("./routes/auth.routes");
const db = require("./models");

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());
app.use(morgan("dev"));
app.set('trust proxy', 1);

app.use("/api/auth", authRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

const port = Number(process.env.PORT) || 4000;

db.sequelize.sync({ force: false })
  .then(() => {
    console.log("MySQL DB 연결 및 테이블 동기화 완료!");
    
    // DB 연결이 성공하면 그때 Express 서버를 켭니다.
    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("DB 연결 실패 :", err);
  });

