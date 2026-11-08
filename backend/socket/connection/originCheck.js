// 소켓 접속 주소 검사 파일, 웹소켓만 쓰면 cors가 안 걸려 Origin 헤더를 직접 봄 (DP-034)
// socket.js가 new Server의 allowRequest로 넣음, 허용 목록은 config/frontendOrigins (부를 때마다 env에서 읽음)
const { getAllowedOrigins } = require("../../config/frontendOrigins");
const { isProduction } = require("../../config/nodeEnv");

// 비교용: 앞뒤 공백·끝 슬래시 빼고 소문자 (브라우저 Origin은 소문자·끝 슬래시 없음)
const normalize = (value) => value.trim().replace(/\/+$/, "").toLowerCase();

// 받을지 판단 → { ok, reason }
// Origin 있음: 허용 목록에 있어야 함 (개발도 같음)
// Origin 없음(서버 간·부하 시험 도구): 운영은 거절, 개발·시험은 허용
function checkSocketOrigin(origin, { env = process.env, allowedOrigins = getAllowedOrigins() } = {}) {
    if (typeof origin !== "string" || origin.trim() === "") {
        return isProduction(env) ? { ok: false, reason: "ORIGIN_REQUIRED" } : { ok: true, reason: "NO_ORIGIN_DEV" };
    }
    const allowed = new Set(allowedOrigins.map(normalize));
    return allowed.has(normalize(origin)) ? { ok: true, reason: "ALLOWED" } : { ok: false, reason: "ORIGIN_NOT_ALLOWED" };
}

// engine.io allowRequest 모양 (req, callback(message, success)), 연결 요청마다 부름
function createOriginGuard({ getEnv = () => process.env, getOrigins = getAllowedOrigins } = {}) {
    return (req, callback) => {
        const { ok, reason } = checkSocketOrigin(req.headers?.origin, { env: getEnv(), allowedOrigins: getOrigins() });
        callback(ok ? null : reason, ok);
    };
}

module.exports = { checkSocketOrigin, createOriginGuard };
