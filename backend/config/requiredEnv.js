// 필수 환경값 확인 파일, 서버 시작 때 꼭 있어야 할 값이 비었는지 보기
// index.js가 시작할 때 부름 (비면 로그인 전부 500·소켓 전부 거절인 채로 뜨는 것 막기)

// NODE_ENV 판정은 nodeEnv 한 곳 (정확히 production이어야 개발 규칙(1명 판·스택 응답) 안 샘)
const { isProduction, isUnknownNodeEnv } = require("./nodeEnv");

// 없으면 서버가 쓸모없는 값 (DB 주소·토큰 서명 키·프런트 주소)
const REQUIRED_ENV_KEYS = ["DATABASE_URL", "JWT_SECRET", "FRONTEND_URL"];

// 빠진 값 이름 목록 (빈 글자·공백만도 빠진 것), 값 자체는 안 돌려줌 (로그에 비밀 값 안 남기기)
const findMissingEnv = (env = process.env) =>
    REQUIRED_ENV_KEYS.filter((key) => typeof env[key] !== "string" || env[key].trim() === "");

// 개발·시험에서만 쓰는 주소 끝말 (예약된 이름이라 진짜 서비스 주소로는 못 씀)
const LOCAL_HOST_SUFFIXES = [".localhost", ".test", ".example", ".invalid", ".local"];

// 운영 주소 모양인지: https + 진짜 도메인 (localhost·IP 주소·예약된 끝말은 아님, 못 읽는 주소도 아님)
// 예: "https://play.example.com" → true, "http://localhost:5173"·"https://192.168.0.10:5173"·"https://a.example.test" → false
const isProductionLikeUrl = (value) => {
    let url;
    try { url = new URL(String(value ?? "").trim()); } catch { return false; }
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || LOCAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
    // IP 주소: IPv6는 [..]로 옴, IPv4는 숫자와 점뿐
    if (host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
    return true;
};

// 운영 주소(FRONTEND_URL)인데 NODE_ENV가 production이 아닌지 (운영 서버가 개발 규칙으로 뜬 것)
const isDevModeOnProductionUrl = (env = process.env) =>
    !isProduction(env) && isProductionLikeUrl(env.FRONTEND_URL);

// NODE_ENV가 모르는 값·운영 주소인데 개발 값·빠진 값이 있으면 던짐 (시작 실패로 이어지게)
// NODE_ENV 먼저 봄: 둘 다 틀려도 NODE_ENV 표시가 남아 개발에서도 시작 거부되게
const assertRequiredEnv = (env = process.env) => {
    if (isUnknownNodeEnv(env)) {
        const error = new Error(`NODE_ENV 값이 올바르지 않습니다 (production·development·test 중 하나)`);
        error.code = "UNKNOWN_NODE_ENV";
        throw error;
    }
    // 운영 주소인데 개발·시험 값이면 거부 (스택 응답·https 아닌 쿠키 같은 개발 규칙이 운영에 켜짐), 주소 값은 글에 안 넣음
    if (isDevModeOnProductionUrl(env)) {
        const error = new Error(`FRONTEND_URL이 운영 주소(https 도메인)인데 NODE_ENV가 production이 아닙니다 (운영 서버면 NODE_ENV=production)`);
        error.code = "DEV_MODE_ON_PRODUCTION_URL";
        throw error;
    }
    const missing = findMissingEnv(env);
    if (missing.length > 0) {
        throw new Error(`필수 환경값이 없습니다: ${missing.join(", ")}`);
    }
};

// 서명·해시 키 최소 길이와 예시 값 모양 (예시 파일 값 그대로 운영에 올리는 것 막기)
const SECRET_MIN_LENGTH = 32;
const SECRET_KEYS = ["JWT_SECRET", "SIGNUP_EMAIL_HMAC_SECRET"];
const PLACEHOLDER_PATTERN = /^(change|replace|example|your|secret|test|dev)|change[-_]?me|placeholder/i;

// 짧거나 예시 모양인 키 이름 목록 (빈 값은 빠진 값 검사 몫이라 뺌), 값 자체는 안 돌려줌
const findWeakSecrets = (env = process.env) => SECRET_KEYS.filter((key) => {
    const value = typeof env[key] === "string" ? env[key].trim() : "";
    if (!value) return false;
    return value.length < SECRET_MIN_LENGTH || PLACEHOLDER_PATTERN.test(value);
});

// 약한 키 있으면 던짐 (index.js가 운영이면 시작 거부, 개발이면 경고만)
const assertStrongSecrets = (env = process.env) => {
    const weak = findWeakSecrets(env);
    if (weak.length > 0) {
        throw new Error(`서명 키가 약합니다(${SECRET_MIN_LENGTH}자 미만이거나 예시 값): ${weak.join(", ")}`);
    }
};

// 시작 거부할 오류인지: 운영이면 다, 개발이어도 모르는 NODE_ENV·운영 주소인데 개발 값은 거부 (운영이 개발 규칙으로 뜨는 것 막기)
const isStartupFatal = (error, env = process.env) =>
    isProduction(env) || error?.code === "UNKNOWN_NODE_ENV" || error?.code === "DEV_MODE_ON_PRODUCTION_URL";

module.exports = {
    REQUIRED_ENV_KEYS, SECRET_MIN_LENGTH, findMissingEnv, assertRequiredEnv, findWeakSecrets, assertStrongSecrets, isStartupFatal,
    isProductionLikeUrl, isDevModeOnProductionUrl,
};
