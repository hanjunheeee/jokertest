'use strict';

// 브라우저 시험(e2e) 손잡이 켜짐 판정 파일, E2E_HOOKS=1이고 운영 아닐 때만 켬 + 운영에 시험 값 있으면 시작 거부
// index.js(시작 검사·/e2e 경로)·메일 발송기 고르기·게임 시험 손잡이가 씀
const { isProduction } = require('./nodeEnv');

// 운영에 있으면 안 되는 시험 전용 값 (역할 고정·시간 넘기기 경로, 메일 파일 받는 곳, 가짜 소셜 제공자 주소, 가짜 토스 승인 서버 주소)
const E2E_ONLY_KEYS = ['E2E_HOOKS', 'MAIL_TEST_OUTBOX_DIR', 'GOOGLE_OAUTH_BASE_URL', 'DISCORD_OAUTH_BASE_URL', 'TOSS_API_BASE_URL'];

const hasText = (value) => typeof value === 'string' && value.trim() !== '';

// 시험 손잡이 켜졌는지: 정확히 1 + 운영 아님 (운영이면 값이 있어도 늘 꺼짐)
const isE2eHooksEnabled = (env = process.env) => env.E2E_HOOKS === '1' && !isProduction(env);

// 메일 파일 받는 곳: 운영 아니고 값 있을 때만 (운영이면 늘 null)
const getMailTestOutboxDir = (env = process.env) =>
    (!isProduction(env) && hasText(env.MAIL_TEST_OUTBOX_DIR) ? env.MAIL_TEST_OUTBOX_DIR.trim() : null);

// 가짜 소셜 제공자 주소: 시험 손잡이 켜졌고 값 있을 때만, 끝 빗금 뗌 (아니면 null → 진짜 제공자 주소 그대로)
const getOAuthTestBaseUrl = (key, env = process.env) =>
    (isE2eHooksEnabled(env) && hasText(env[key]) ? env[key].trim().replace(/\/+$/, '') : null);

// 운영인데 시험 값이 있으면 던짐 (index.js가 운영이면 시작 거부), 값 자체는 안 찍음
const assertNoE2eInProduction = (env = process.env) => {
    if (!isProduction(env)) return;
    const found = E2E_ONLY_KEYS.filter((key) => hasText(env[key]));
    if (found.length > 0) {
        const error = new Error(`운영에선 시험 전용 값을 못 씀: ${found.join(', ')}`);
        error.code = 'E2E_IN_PRODUCTION';
        throw error;
    }
};

module.exports = { E2E_ONLY_KEYS, isE2eHooksEnabled, getMailTestOutboxDir, getOAuthTestBaseUrl, assertNoE2eInProduction };
