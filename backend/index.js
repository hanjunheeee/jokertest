// 필요한 모듈 및 환경변수 설정
// .env 파일의 환경변수를 로드하고, Express 및 필요한 외부 미들웨어들을 가져옵니다.
const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const morgan = require("morgan"); // HTTP 요청 로그를 찍어주는 미들웨어

// 라우터, 에러 핸들러 및 DB 모델 불러오기
const { notFoundHandler, globalErrorHandler } = require("./middleware/errorHandler")
const authRouter = require("./routes/auth.routes");
const db = require("./models");

// Express 앱 인스턴스 생성
const app = express();

// 전역 미들웨어 설정
// 프론트엔드와의 교차 출처 리소스 공유(CORS) 및 쿠키 전송을 허용합니다.
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));

// JSON 및 URL-encoded 데이터 파싱, 쿠키 파싱, 요청 로깅 설정
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());
app.use(morgan("dev"));

// 프록시 환경(Nginx, AWS ELB 등) 뒤에 서버가 있을 때, 
// 클라이언트의 실제 IP(x-forwarded-for)를 정확히 파악하기 위한 설정입니다.
app.set('trust proxy', 1);

// API 라우트 등록
// 도메인별로 분리해둔 미니 라우터들을 메인 경로에 꽂아줍니다.
app.use("/auth", authRouter);

// 에러 핸들링 미들웨어 등록
// 주의: 에러를 낚아채야 하므로 반드시 모든 라우트 설정의 가장 마지막에 위치해야 합니다.
app.use(notFoundHandler);     // 매칭되는 라우터가 없을 때 404 처리
app.use(globalErrorHandler);  // 앱 전역에서 발생한 500 에러 처리

// 서버 포트 설정 (환경변수 우선, 없으면 기본값 4000)
const port = Number(process.env.PORT) || 4000;

// DB 연결 및 서버 실행
// Sequelize를 통해 MySQL DB와 모델을 동기화(sync)한 후, 성공 시 Express 서버를 기동합니다.
db.sequelize.sync({ force: false }) // force: true로 하면 서버 켤 때마다 테이블이 날아가므로 주의!
  .then(() => {
    console.log("MySQL DB 연결 및 테이블 동기화 완료!");
    
    // DB 연결이 완벽하게 성공하면 그때 안전하게 서버 입구를 엽니다.
    app.listen(port, () => {
      console.log(`Backend listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    // DB가 죽어있거나 비밀번호가 틀린 경우 에러를 뱉고 서버를 켜지 않습니다.
    console.error("DB 연결 실패 :", err);
  });