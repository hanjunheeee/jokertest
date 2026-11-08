// 필수 환경값 확인 파일, 서버 시작 때 꼭 있어야 할 값이 비었는지 보기
// index.js가 시작할 때 부름 (비면 로그인 전부 500·소켓 전부 거절인 채로 뜨는 것 막기)

// NODE_ENV 판정은 nodeEnv 한 곳 (정확히 production이어야 개발 규칙(1명 판·스택 응답) 안 샘)
const { isProduction, isUnknownNodeEnv } = require("./nodeEnv");

// 없으면 서버가 쓸모없는 값 (DB 주소·토큰 서명 키·프런트 주소)
const REQUIRED_ENV_KEYS = ["DATABASE_URL", "JWT_SECRET", "FRONTEND_URL"];

// 빠진 값 이름 목록 (빈 글자·공백만도 빠진 것), 값 자체는 안 돌려줌 (로그에 비밀 값 안 남기기)
const findMissingEnv = (env = process.env) =>
    REQUIRED_ENV_KEYS.filter((key) => typeof env[key] !== "string" || env[key].trim() === "");

// NODE_ENV가 모르는 값이거나 빠진 값이 있으면 던짐 (시작 실패로 이어지게)
// NODE_ENV 먼저 봄: 둘 다 틀려도 모르는 NODE_ENV 표시가 남아 개발에서도 시작 거부되게
const assertRequiredEnv = (env = process.env) => {
    if (isUnknownNodeEnv(env)) {
        const error = new Error(`NODE_ENV 값이 올바르지 않습니다 (production·development·test 중 하나)`);
        error.code = "UNKNOWN_NODE_ENV";
        throw error;
    }
    const missing = findMissingEnv(env);
    if (missing.length > 0) {
        throw new Error(`필수 환경값이 없습니다: ${missing.join(", ")}`);
    }
};

// 시작 거부할 오류인지: 운영이면 다, 개발이어도 모르는 NODE_ENV는 거부 (오타로 운영이 개발 규칙으로 뜨는 것 막기)
const isStartupFatal = (error, env = process.env) =>
    isProduction(env) || error?.code === "UNKNOWN_NODE_ENV";

module.exports = { REQUIRED_ENV_KEYS, findMissingEnv, assertRequiredEnv, isStartupFatal };
