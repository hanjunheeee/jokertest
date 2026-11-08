'use strict';

// 운영 받침 시험: 내부 API 5개 (키 없음·틀림·맞음·꺼짐·짧은 키·요청 수 제한·로그에 키 안 남음·저장 금지)
// 서비스는 모듈 객체 함수를 가짜로 갈아끼움 (진짜 DB·소켓 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { GOOD_KEY, startInternalApp, callInternal, captureConsole } = require('./opsFakes');
const disconnectService = require('../../services/ops/disconnect');
const announcementService = require('../../services/ops/announcements');
const maintenanceService = require('../../services/ops/maintenance');
const bannedWordService = require('../../services/ops/bannedWords');
const liveService = require('../../services/ops/live');
const { keysMatch, readConfiguredKey, MIN_KEY_LENGTH } = require('../../middlewares/internalKey.middleware');

const UUID = '11111111-2222-4333-8444-555555555555';

// 경로 5개: 부를 모양 + 가짜로 바꿀 서비스 함수
const ENDPOINTS = [
    { name: '즉시 끊기', method: 'POST', path: `/users/${UUID}/disconnect`, target: disconnectService, fn: 'disconnectUser', result: { uuid: UUID, code: 'ACCOUNT_BANNED', disconnected: 1 } },
    { name: '공지 알림', method: 'POST', path: '/announcements', body: { announcementId: 'a1', title: 't', body: 'b', target: 'online' }, target: announcementService, fn: 'sendAnnouncement', result: { created: 2 } },
    { name: '점검 다시 읽기', method: 'POST', path: '/maintenance/reload', target: maintenanceService, fn: 'reloadMaintenance', result: { enabled: true } },
    { name: '금지어 다시 읽기', method: 'POST', path: '/banned-words/reload', target: bannedWordService, fn: 'reloadBannedWords', result: { count: 3 } },
    { name: '지금 상황', method: 'GET', path: '/live', target: liveService, fn: 'getLiveSummary', result: { roomCount: 1, gameCount: 0, rooms: [], games: [] } },
];

// 서비스 바꿔 끼우고 부른 횟수 셈
const stubAll = (t) => {
    const calls = {};
    for (const endpoint of ENDPOINTS) {
        calls[endpoint.fn] = 0;
        t.mock.method(endpoint.target, endpoint.fn, async () => { calls[endpoint.fn] += 1; return endpoint.result; });
    }
    return calls;
};

for (const endpoint of ENDPOINTS) {
    test(`내부 API ${endpoint.name}: 키 없으면 401, 서비스 안 부름`, async (t) => {
        const calls = stubAll(t);
        const url = await startInternalApp(t);
        const res = await callInternal(url, endpoint.method, endpoint.path, { body: endpoint.body });
        assert.equal(res.status, 401);
        assert.equal(res.body.code, 'INTERNAL_UNAUTHORIZED');
        assert.equal(calls[endpoint.fn], 0);
    });

    test(`내부 API ${endpoint.name}: 틀린 키면 401, 서비스 안 부름`, async (t) => {
        const calls = stubAll(t);
        const url = await startInternalApp(t);
        const res = await callInternal(url, endpoint.method, endpoint.path, { key: `${GOOD_KEY}x`, body: endpoint.body });
        assert.equal(res.status, 401);
        assert.equal(calls[endpoint.fn], 0);
    });

    test(`내부 API ${endpoint.name}: 맞는 키면 200 + 서비스 결과`, async (t) => {
        const calls = stubAll(t);
        const url = await startInternalApp(t);
        const res = await callInternal(url, endpoint.method, endpoint.path, { key: GOOD_KEY, body: endpoint.body });
        assert.equal(res.status, 200);
        assert.equal(res.body.ok, true);
        assert.equal(calls[endpoint.fn], 1);
        assert.equal(res.headers.get('cache-control'), 'no-store');
    });

    test(`내부 API ${endpoint.name}: 환경값 없으면 경로 전체 꺼짐(404), 맞는 키여도`, async (t) => {
        const calls = stubAll(t);
        const url = await startInternalApp(t, { env: {} });
        const res = await callInternal(url, endpoint.method, endpoint.path, { key: GOOD_KEY, body: endpoint.body });
        assert.equal(res.status, 404);
        assert.equal(calls[endpoint.fn], 0);
    });

    test(`내부 API ${endpoint.name}: 요청 수 넘으면 429 (틀린 키 시도도 셈)`, async (t) => {
        const calls = stubAll(t);
        const url = await startInternalApp(t, { max: 2 });
        await callInternal(url, endpoint.method, endpoint.path, { key: 'wrong', body: endpoint.body });
        await callInternal(url, endpoint.method, endpoint.path, { key: GOOD_KEY, body: endpoint.body });
        const third = await callInternal(url, endpoint.method, endpoint.path, { key: GOOD_KEY, body: endpoint.body });
        assert.equal(third.status, 429);
        assert.equal(third.body.code, 'RATE_LIMITED');
        assert.equal(calls[endpoint.fn], 1);
    });

    test(`내부 API ${endpoint.name}: 로그·응답에 키 값이 안 남음 (맞음·틀림·서비스 오류 모두)`, async (t) => {
        const lines = captureConsole(t);
        t.mock.method(endpoint.target, endpoint.fn, async () => { throw new Error('서비스 터짐'); });
        const url = await startInternalApp(t);
        const wrongKey = 'w'.repeat(48);
        const bad = await callInternal(url, endpoint.method, endpoint.path, { key: wrongKey, body: endpoint.body });
        const broken = await callInternal(url, endpoint.method, endpoint.path, { key: GOOD_KEY, body: endpoint.body });
        assert.equal(bad.status, 401);
        assert.equal(broken.status, 500);
        const everything = lines.join('\n') + JSON.stringify(bad.body) + JSON.stringify(broken.body);
        assert.ok(!everything.includes(GOOD_KEY), '맞는 키가 로그·응답에 남음');
        assert.ok(!everything.includes(wrongKey), '틀린 키가 로그·응답에 남음');
    });
}

test('내부 API: 키가 32자 못 되면 꺼짐으로 봄 (짧은 키로 열리지 않음)', async (t) => {
    stubAll(t);
    const shortKey = 's'.repeat(MIN_KEY_LENGTH - 1);
    const url = await startInternalApp(t, { env: { INTERNAL_API_KEY: shortKey } });
    const res = await callInternal(url, 'GET', '/live', { key: shortKey });
    assert.equal(res.status, 404);
    assert.equal(readConfiguredKey({ INTERNAL_API_KEY: shortKey }), null);
    assert.equal(readConfiguredKey({ INTERNAL_API_KEY: GOOD_KEY }), GOOD_KEY);
});

test('내부 API: 키 비교는 길이 달라도 던지지 않고 false (상수 시간 비교 앞 해시)', () => {
    assert.equal(keysMatch(GOOD_KEY, GOOD_KEY), true);
    assert.equal(keysMatch('a', GOOD_KEY), false);
    assert.equal(keysMatch(`${GOOD_KEY}${GOOD_KEY}`, GOOD_KEY), false);
    assert.equal(keysMatch(undefined, GOOD_KEY), false);
    assert.equal(keysMatch('', GOOD_KEY), false);
});

test('내부 API: 없는 내부 경로는 맞는 키여도 404', async (t) => {
    const url = await startInternalApp(t);
    const res = await callInternal(url, 'GET', '/nothing', { key: GOOD_KEY });
    assert.equal(res.status, 404);
});

test('내부 API 공지: 잘못된 본문은 400 (서비스 검사)', async (t) => {
    const url = await startInternalApp(t);
    const res = await callInternal(url, 'POST', '/announcements', { key: GOOD_KEY, body: { announcementId: 'bad id!', title: 't', body: 'b', target: 'online' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_ANNOUNCEMENT');
});

test('내부 API 끊기: uuid 모양 아니면 400', async (t) => {
    const url = await startInternalApp(t);
    const res = await callInternal(url, 'POST', '/users/not-a-uuid/disconnect', { key: GOOD_KEY });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_UUID');
});
