// 클라우드플레어 IP 확인용 가짜 백엔드, 진짜 백엔드와 같은 trust proxy·IP 읽기·요청 로그 모양으로 받은 IP를 돌려줌
// run.sh가 docker 망 안에서 backend:4000 이름으로 켬 (DB 안 씀, 진짜 서버 안 건드림)
const http = require("node:http");
const express = require("express");
const morgan = require("morgan");
const { Server } = require("socket.io");
const { TRUST_PROXY_HOPS, getClientIp, getSocketClientIp } = require("/app/utils/request.js");

const app = express();
// index.js와 같은 자리·같은 값
morgan.token("client-ip", (req) => getClientIp(req));
app.use(morgan(":client-ip :method :url :status"));
app.set("trust proxy", TRUST_PROXY_HOPS);

// 받은 IP 그대로 보여 주기 (nginx가 넘긴 머리말도 같이)
const whoami = (req, res) => res.json({
    ip: getClientIp(req),
    xff: req.headers["x-forwarded-for"] ?? null,
    cfConnectingIp: req.headers["cf-connecting-ip"] ?? null,
});
app.get("/whoami", whoami);
app.all("/internal/ping", whoami);
app.post("/auth/login", whoami);

const server = http.createServer(app);
const io = new Server(server, { transports: ["websocket"] });
// socket.js와 같은 자리: 인증 앞에서 접속 IP 정하기
io.use((socket, next) => {
    socket.data.clientIp = getSocketClientIp(socket);
    next();
});
io.on("connection", (socket) => {
    console.log(`[socket] ${socket.data.clientIp} 접속`);
    socket.emit("whoami", socket.data.clientIp);
});

server.listen(4000, () => console.log("[stub] 4000 켜짐"));
