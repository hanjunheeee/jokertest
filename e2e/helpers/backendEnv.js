'use strict';

// 시험 백엔드 환경값 파일, 시험 DB·시험 포트·시험 손잡이 값을 만듦 (backend/.env·밖의 환경값은 안 섞음)
// scripts/start-backend.js(4100 본 서버, E2E_NODES=2면 Node마다)와 helpers/servers.js(요청 제한·시작 거부 시험용 따로 띄우는 서버)가 씀
const { E2E, MAIL_DIR, SHUTDOWN_FLAG, shutdownFlagFor, redisPrefix } = require('./env');

// 시험 수백 개가 같은 ip(127.0.0.1)라 ip 제한만 넉넉히 (사람·이메일별 제한은 그대로)
const RAISED_IP_LIMITS = Object.freeze({
    LOGIN_IP_MAX: '100000',
    CHECK_EMAIL_IP_MAX: '100000',
    REFRESH_IP_MAX: '100000',
    SOCIAL_SIGNUP_IP_MAX: '100000',
    SIGNUP_IP_HOUR_MAX: '100000',
    SIGNUP_IP_DAY_MAX: '100000',
    FIND_ID_IP_MAX: '100000',
    PASSWORD_RESET_REQUEST_IP_MAX: '100000',
    PASSWORD_RESET_CHECK_IP_MAX: '100000',
});

// 백엔드에 줄 환경값: 시험 DB·시험 포트·시험 손잡이, 진짜 메일·소셜 키는 안 줌 (backend/.env는 cwd를 바꿔 안 읽게 함)
// 지금 환경에서 백엔드 설정 이름은 전부 뺌 (밖에서 넘어온 DB 주소·메일·소셜 키가 섞이지 않게)
const BACKEND_KEY_PATTERN = /^(DATABASE_URL|JWT_|MAIL_|PASSWORD_RESET_|SIGNUP_|GOOGLE_|DISCORD_|TOSS_|INTERNAL_|GAME_|E2E_|LOGIN_|FRONTEND_|NODE_OPTIONS$|NODE_ENV$|PORT$|LOG_|SERVER_ID$|NIGHT_|CHECK_EMAIL_|REFRESH_|SOCIAL_|FIND_ID_|REDIS_|CLUSTER_|NODE_COUNT$|NODE_DEAD_|DB_MAX_CONNECTIONS$)/i;
// 위 목록에 REDIS_·CLUSTER_도 있음 → 밖의 REDIS_URL이 섞여 단일 서버가 Redis 모드로 켜지는 일 막기 (Node 여러 개는 아래 node 칸으로만 넣음)
const baseEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !BACKEND_KEY_PATTERN.test(key)));

/**
 * 백엔드 환경값 만들기
 * @param {object} secrets .env.e2e 값
 * @param {object} [o]
 * @param {number} [o.port=4100]
 * @param {boolean} [o.defaultIpLimits=false] true면 ip 제한을 운영 기본값 그대로 (요청 수 제한 시험용)
 * @param {{id:string,port:number}} [o.node] Node 여러 개 실행의 Node 하나 (SERVER_ID·Redis·꺼짐 깃발을 그 Node 것으로)
 * @param {object} [o.overrides] 마지막에 덮어쓸 값 (undefined면 그 키를 뺌)
 */
const backendEnv = (secrets, { port = E2E.backendPort, defaultIpLimits = false, node = null, overrides = {} } = {}) => {
    const env = {
        ...baseEnv(),
        NODE_ENV: 'development',
        PORT: String(port),
        DATABASE_URL: secrets.DATABASE_URL,
        JWT_SECRET: secrets.JWT_SECRET,
        SIGNUP_EMAIL_HMAC_SECRET: secrets.SIGNUP_EMAIL_HMAC_SECRET,
        INTERNAL_API_KEY: secrets.INTERNAL_API_KEY,
        ...(secrets.TOSS_TEST_SECRET_KEY ? { TOSS_TEST_SECRET_KEY: secrets.TOSS_TEST_SECRET_KEY } : {}),
        ...(secrets.TOSS_TEST_SECURITY_KEY ? { TOSS_TEST_SECURITY_KEY: secrets.TOSS_TEST_SECURITY_KEY } : {}),
        ...(secrets.TOSS_TEST_CLIENT_KEY ? { TOSS_TEST_CLIENT_KEY: secrets.TOSS_TEST_CLIENT_KEY } : {}),
        FRONTEND_URL: E2E.desktopUrl,
        FRONTEND_MOBILE_URL: E2E.mobileUrl,
        PASSWORD_RESET_APP_URL: E2E.desktopUrl,
        // 시험 손잡이 (운영이면 서버가 시작 거부)
        E2E_HOOKS: '1',
        MAIL_TEST_OUTBOX_DIR: MAIL_DIR,
        E2E_SHUTDOWN_FLAG: SHUTDOWN_FLAG,
        GAME_DEV_MIN_PLAYERS: '1',
        ...(defaultIpLimits ? {} : RAISED_IP_LIMITS),
        LOG_DIR: 'off',
        SERVER_ID: 'e2e',
        // Node 여러 개: 같은 Redis·같은 앞머리(실행마다 따로), Node마다 꺼짐 깃발 따로
        ...(node ? {
            PORT: String(node.port),
            SERVER_ID: node.id,
            REDIS_URL: E2E.redisUrl,
            REDIS_KEY_PREFIX: redisPrefix(),
            E2E_SHUTDOWN_FLAG: shutdownFlagFor(node.id),
            // 시험 기계 하나에 Node 몇 개 → 풀 합 경고 계산도 그 수로
            NODE_COUNT: String(E2E.nodeCount),
        } : {}),
    };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete env[key]; else env[key] = String(value);
    }
    return env;
};

module.exports = { backendEnv, RAISED_IP_LIMITS };
