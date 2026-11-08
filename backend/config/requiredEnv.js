// 필수 환경값 확인 파일, 서버 시작 때 꼭 있어야 할 값이 비었는지 보기
// index.js가 시작할 때 부름 (비면 로그인 전부 500·소켓 전부 거절인 채로 뜨는 것 막기)

// 없으면 서버가 쓸모없는 값 (DB 주소·토큰 서명 키·프런트 주소)
const REQUIRED_ENV_KEYS = ["DATABASE_URL", "JWT_SECRET", "FRONTEND_URL"];

// 운영에서만 따로 보는 값: NODE_ENV는 정확히 production이어야 개발 규칙(1명 판·스택 응답) 안 샘
const KNOWN_NODE_ENVS = new Set(["production", "development", "test"]);

// 빠진 값 이름 목록 (빈 글자·공백만도 빠진 것), 값 자체는 안 돌려줌 (로그에 비밀 값 안 남기기)
const findMissingEnv = (env = process.env) =>
    REQUIRED_ENV_KEYS.filter((key) => typeof env[key] !== "string" || env[key].trim() === "");

// 빠진 값이 있거나 NODE_ENV가 모르는 값이면 던짐 (시작 실패로 이어지게)
const assertRequiredEnv = (env = process.env) => {
    const missing = findMissingEnv(env);
    if (missing.length > 0) {
        throw new Error(`필수 환경값이 없습니다: ${missing.join(", ")}`);
    }
    if (env.NODE_ENV !== undefined && !KNOWN_NODE_ENVS.has(env.NODE_ENV)) {
        throw new Error(`NODE_ENV 값이 올바르지 않습니다 (production·development·test 중 하나)`);
    }
};

module.exports = { REQUIRED_ENV_KEYS, findMissingEnv, assertRequiredEnv };
