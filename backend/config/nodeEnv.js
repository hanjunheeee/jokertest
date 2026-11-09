// 실행 환경 판정 파일, 운영인지 보는 곳을 한 함수로 모음 (BE-028)
// requiredEnv·matchmaking 인원 규칙이 씀 (game-core는 밖을 안 불러 같은 규칙을 따로 둠)

// 받아 주는 NODE_ENV 값, 이 밖의 값이면 시작 거부
const KNOWN_NODE_ENVS = new Set(["production", "development", "test"]);

// 운영인지: 정확히 production일 때만 (값 없음·오타는 운영 아님, 오타는 시작 때 막음)
const isProduction = (env = process.env) => env.NODE_ENV === "production";

// 모르는 NODE_ENV인지 (값 없음·빈 글자는 개발로 침, 오타는 모름)
// 빈 글자도 없음으로 봄: .env 예시의 `NODE_ENV=`를 그대로 쓰면 개발에서도 시작 거부됐음 (2026-11-09)
const isUnknownNodeEnv = (env = process.env) => {
    const value = env.NODE_ENV;
    if (value === undefined || String(value).trim() === "") return false;
    return !KNOWN_NODE_ENVS.has(value);
};

module.exports = { KNOWN_NODE_ENVS, isProduction, isUnknownNodeEnv };
