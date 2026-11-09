'use strict';

// 인증 ip 제한 셋(아이디 찾기·재설정 요청·재설정 확인)의 나눠 세는 키가 안 겹치는지 보는 시험
// 창·최대를 일부러 같게 맞춰도 Redis 키 `rl:<이름>:ip:…`가 서로 달라야 함 (멀티노드 통합)
const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');
const {
    buildFindIdRateLimiters,
    buildPasswordResetRateLimiters,
} = require('../../middlewares/authRateLimit.middleware');

// 키별로 따로 세는 가짜 나눠 세는 곳 (Redis 카운터 자리), 받은 키는 기록
const createFakeStore = () => {
    const counts = new Map();
    const keys = [];
    return {
        keys,
        counts,
        active: () => true,
        hit: async (key) => {
            keys.push(key);
            counts.set(key, (counts.get(key) || 0) + 1);
            return { count: counts.get(key) };
        },
    };
};

// 라우트처럼 createRateLimiter를 넘기되 세는 곳만 가짜로
const withStore = (store) => (options) => createRateLimiter({ ...options, store });

const callOnce = (limiter) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json() { resolve(this.statusCode); return this; },
    };
    Promise.resolve(limiter({ ip: '1.2.3.4' }, res, () => resolve('next')));
});

// 셋 다 창 10분·최대 1로 맞춤 → name 없으면 키가 `600000:1:ip:1.2.3.4`로 셋 다 같아짐
const SAME_ENV = {
    FIND_ID_WINDOW_MS: '600000',
    FIND_ID_IP_MAX: '1',
    PASSWORD_RESET_REQUEST_WINDOW_MS: '600000',
    PASSWORD_RESET_REQUEST_IP_MAX: '1',
    PASSWORD_RESET_CHECK_WINDOW_MS: '600000',
    PASSWORD_RESET_CHECK_IP_MAX: '1',
};

test('인증 ip 제한 셋은 창·최대가 같아도 나눠 세는 키가 다름', async () => {
    const store = createFakeStore();
    const make = withStore(store);
    const findId = buildFindIdRateLimiters(SAME_ENV, make);
    const reset = buildPasswordResetRateLimiters(SAME_ENV, make);

    assert.equal(await callOnce(findId.ip), 'next');
    assert.equal(await callOnce(reset.requestIp), 'next');
    assert.equal(await callOnce(reset.checkIp), 'next');

    assert.deepEqual(store.keys, [
        'find-id-ip:ip:1.2.3.4',
        'reset-request-ip:ip:1.2.3.4',
        'reset-check-ip:ip:1.2.3.4',
    ]);
});

test('아이디 찾기를 다 써도 재설정 ip 제한은 따로 셈', async () => {
    const store = createFakeStore();
    const make = withStore(store);
    const findId = buildFindIdRateLimiters(SAME_ENV, make);
    const reset = buildPasswordResetRateLimiters(SAME_ENV, make);

    assert.equal(await callOnce(findId.ip), 'next');
    assert.equal(await callOnce(findId.ip), 429);
    // 키가 겹치면 여기서 이미 3번째라 429
    assert.equal(await callOnce(reset.requestIp), 'next');
    assert.equal(await callOnce(reset.checkIp), 'next');
});

test('cluster 카운터에 가는 키는 rl:<이름>:ip:… 모양', async () => {
    const cluster = require('../../cluster');
    const { createMemoryHub, quietLog } = require('../../cluster/testing/memoryCluster');
    const hub = createMemoryHub();
    await cluster.init({ backend: hub.backend(), env: { SERVER_ID: 'n1' }, log: quietLog });
    try {
        const findId = buildFindIdRateLimiters(SAME_ENV, createRateLimiter);
        const reset = buildPasswordResetRateLimiters(SAME_ENV, createRateLimiter);
        await callOnce(findId.ip);
        await callOnce(reset.checkIp);
        assert.equal((await cluster.counters.peek('rl:find-id-ip:ip:1.2.3.4')).count, 1);
        assert.equal((await cluster.counters.peek('rl:reset-check-ip:ip:1.2.3.4')).count, 1);
        assert.equal((await cluster.counters.peek('rl:reset-request-ip:ip:1.2.3.4')).count, 0);
    } finally {
        await cluster.close();
        hub.close();
    }
});
