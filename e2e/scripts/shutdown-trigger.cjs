// 서버 꺼짐 시험용 preload 파일, 깃발 파일이 생기면 서버 안에서 SIGTERM을 냄 (윈도는 밖에서 SIGTERM을 못 보냄)
// scripts/start-backend.js가 시험 전용 백엔드(4100)에만 node --require로 붙임, 서버 코드는 안 고침
const fs = require("fs");

const flag = process.env.E2E_SHUTDOWN_FLAG;
if (flag) {
    try { fs.unlinkSync(flag); } catch { /* 없으면 그만 */ }
    const timer = setInterval(() => {
        if (!fs.existsSync(flag)) return;
        clearInterval(timer);
        try { fs.unlinkSync(flag); } catch { /* 이미 지워짐 */ }
        console.log("[e2e] 깃발 파일 봄 → SIGTERM 냄");
        process.emit("SIGTERM", "SIGTERM");
    }, 200);
    timer.unref();
}
