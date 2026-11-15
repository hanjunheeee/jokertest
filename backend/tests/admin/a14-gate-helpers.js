'use strict';

// 관리자 문(Access·로그인·세션·쓰기 확인) 시험 여러 파일이 같이 쓰는 작은 도우미 (B-A14-1 몫, 공용 도우미는 안 고침)
// a14-access·all-routes-guard·disabled·error-shape·login·login-lock·session·csrf 시험이 씀
const crypto = require('node:crypto');

const { setEnv, TEST_ORIGIN, createTestAdmin, otpNow } = require('./helpers/adminTestApp');

// 누가 봐도 가짜인 시험 값 (진짜 .env 값은 안 읽음)
const FAKE_TOTP_KEY = 'ab'.repeat(32);
const FAKE_JWT_SECRET = 'a14-gate-fake-jwt-secret-not-real';
const FAKE_PASSWORD = 'a14-gate-fake-password';
// 이 묶음이 만든 관리자 아이디 머리글자 (다른 에이전트 줄과 안 섞이게)
const NAME_PREFIX = 'g14a';

// 관리자 환경값을 시험 값으로 (Access 끔·시험 Origin·가짜 열쇠), 덮을 값은 extra로 → 되돌리는 함수
const gateEnv = (extra = {}) => setEnv({
    NODE_ENV: 'test',
    ADMIN_TOTP_KEY: FAKE_TOTP_KEY,
    ADMIN_ORIGIN: TEST_ORIGIN,
    ADMIN_ACCESS_MODE: 'off',
    ADMIN_ACCESS_TEAM_DOMAIN: undefined,
    ADMIN_ACCESS_AUD: undefined,
    ADMIN_ACCESS_CERTS_URL: undefined,
    ADMIN_SESSION_IDLE_MIN: undefined,
    JWT_SECRET: FAKE_JWT_SECRET,
    ...extra,
});

let serial = 0;
// 이 묶음 머리글자 붙인 겹치지 않는 아이디 (예: g14a-lk-m3x1a9-7)
const gateName = (tag) => `${NAME_PREFIX}-${tag}-${Date.now().toString(36)}-${(serial += 1)}${crypto.randomBytes(2).toString('hex')}`;

// 시험 관리자 하나 (아이디·이메일 모두 이 묶음 머리글자)
const makeAdmin = (tag, options = {}) => {
    const loginId = gateName(tag);
    return createTestAdmin({ loginId, email: `${loginId}@example.test`, password: FAKE_PASSWORD, ...options });
};

// 쿠키 원문 → admin_sessions.id (설계 5-3 "sha256만")
const sessionIdOf = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// 틀린 로그인 한 번 (비번만 틀림)
const failLogin = (agent, admin) => agent.post('/admin-api/auth/login', {
    loginId: admin.loginId, password: `${admin.password}-wrong`, otp: otpNow(admin.totpSecret),
});

// 맞는 로그인 한 번 (otp 안 주면 지금 번호)
const goodLogin = (agent, admin, otp) => agent.post('/admin-api/auth/login', {
    loginId: admin.loginId, password: admin.password, otp: otp ?? otpNow(admin.totpSecret),
});

// DB 시각 당김 시계: 기준 시각(anchorMs)에서 얼마나 지났는지 맞추려고 줄 시각을 통째로 앞으로 옮김
// shift(sec)는 "줄 시각 sec초 빼기"를 함 → 시간이 sec초 흐른 것과 같음
// DB 시각 칸이 초 단위라 옮기는 양도 초 단위: atMost = 지난 시간 ≤ 목표, atLeast = 지난 시간 ≥ 목표
const virtualClock = ({ anchorMs, shift }) => {
    let moved = 0;
    return {
        async to(targetMs, side) {
            const want = targetMs - (Date.now() - anchorMs) - moved;
            const step = side === 'atLeast' ? Math.ceil(want / 1000) * 1000 : Math.floor(want / 1000) * 1000;
            if (step > 0) await shift(step / 1000);
            moved += Math.max(step, 0);
        },
        elapsed: () => Date.now() - anchorMs + moved,
    };
};

// 줄 시각 칸 여러 개를 sec초 앞으로 (where는 SQL 조건 + 값)
const shiftColumns = (sequelize, table, columns, whereSql, replacements, sec) => {
    const sets = columns.map((column) => `${column} = DATE_SUB(${column}, INTERVAL :sec SECOND)`).join(', ');
    return sequelize.query(`UPDATE ${table} SET ${sets} WHERE ${whereSql}`, { replacements: { ...replacements, sec } });
};

const MINUTE = 60 * 1000;

module.exports = {
    FAKE_TOTP_KEY,
    FAKE_JWT_SECRET,
    FAKE_PASSWORD,
    NAME_PREFIX,
    MINUTE,
    gateEnv,
    gateName,
    makeAdmin,
    sessionIdOf,
    failLogin,
    goodLogin,
    virtualClock,
    shiftColumns,
};
