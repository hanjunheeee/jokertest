'use strict';

// 운영 받침 시험: 신고 접수 (모양·자기 자신·없는 판·같이 안 한 판·중복·동시 중복·채팅 증거·요청 수 제한·처리기)
// 가짜 신고 db·가짜 판 장부·가짜 채팅 보관 (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const reportService = require('../../services/ops/report');
const playerController = require('../../controllers/ops/player');
const { createReportDb, captureConsole } = require('./opsFakes');
const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');
const { listenOnFetchableUrl } = require('../helpers/fetchablePort');

const ME = 'aaaaaaaa-0000-4000-8000-00000000000a';
const TARGET = 'bbbbbbbb-0000-4000-8000-00000000000b';
const OTHER = 'cccccccc-0000-4000-8000-00000000000c';
const LIVE_GAME = '11111111-0000-4000-8000-000000000001';
const SAVED_GAME = '22222222-0000-4000-8000-000000000002';

// 진행 중 판 하나(나·대상) + 저장된 판 하나(나·대상) + 채팅 보관 가짜
const setup = ({ messages = [] } = {}) => {
    const db = createReportDb({ resultPlayers: [{ game_id: SAVED_GAME, user_id: ME }, { game_id: SAVED_GAME, user_id: TARGET }] });
    const gameSessions = new Map([[LIVE_GAME, { id: LIVE_GAME, players: new Map([[ME, {}], [TARGET, {}]]) }]]);
    const chatBuffer = { getGameChatMessages: () => messages };
    return { db, deps: { db, gameSessions, chatBuffer, now: () => new Date('2026-11-09T00:00:00Z') } };
};
const body = (overrides = {}) => ({ targetUuid: TARGET, gameId: LIVE_GAME, reasonCode: 'ABUSE', ...overrides });
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => { assert.equal(error.code, code); return true; });

test('신고: 진행 중 판에서 같이 한 사람 신고하면 OPEN으로 저장', async () => {
    const { db, deps } = setup();
    const result = await reportService.submitReport({ reporterId: ME, body: body({ memo: '  욕함  ' }) }, deps);
    assert.equal(result.reportId, 1);
    assert.equal(db.reports[0].status, 'OPEN');
    assert.equal(db.reports[0].memo, '욕함');
    assert.equal(db.reports[0].reporter_id, ME);
});

test('신고: 판이 끝나 저장된 판(game_result_players)에서도 신고됨', async () => {
    const { db, deps } = setup();
    await reportService.submitReport({ reporterId: ME, body: body({ gameId: SAVED_GAME }) }, deps);
    assert.equal(db.reports.length, 1);
});

test('신고: 자기 자신은 400 SELF_REPORT', async () => {
    const { deps } = setup();
    await rejectsWith(reportService.submitReport({ reporterId: ME, body: body({ targetUuid: ME }) }, deps), 'SELF_REPORT');
});

test('신고: 자기 자신 uuid를 대문자로 보내도 SELF_REPORT', async () => {
    const { deps } = setup();
    await rejectsWith(reportService.submitReport({ reporterId: ME, body: body({ targetUuid: ME.toUpperCase() }) }, deps), 'SELF_REPORT');
});

test('신고: 없는 판은 404 GAME_NOT_FOUND', async () => {
    const { deps } = setup();
    await rejectsWith(reportService.submitReport({ reporterId: ME, body: body({ gameId: '99999999-0000-4000-8000-000000000009' }) }, deps), 'GAME_NOT_FOUND');
});

test('신고: 대상이 그 판에 없으면 404 (같이 안 한 사람 신고 막기)', async () => {
    const { deps } = setup();
    await rejectsWith(reportService.submitReport({ reporterId: ME, body: body({ targetUuid: OTHER }) }, deps), 'GAME_NOT_FOUND');
    await rejectsWith(reportService.submitReport({ reporterId: ME, body: body({ targetUuid: OTHER, gameId: SAVED_GAME }) }, deps), 'GAME_NOT_FOUND');
});

test('신고: 같은 판 같은 대상 두 번이면 409 DUPLICATE_REPORT', async () => {
    const { db, deps } = setup();
    await reportService.submitReport({ reporterId: ME, body: body() }, deps);
    await rejectsWith(reportService.submitReport({ reporterId: ME, body: body({ reasonCode: 'SPAM' }) }, deps), 'DUPLICATE_REPORT');
    assert.equal(db.reports.length, 1);
});

test('신고: 다른 판이면 같은 대상도 또 신고됨', async () => {
    const { db, deps } = setup();
    await reportService.submitReport({ reporterId: ME, body: body() }, deps);
    await reportService.submitReport({ reporterId: ME, body: body({ gameId: SAVED_GAME }) }, deps);
    assert.equal(db.reports.length, 2);
});

test('신고 동시 요청: 같은 신고 둘이 앞 검사를 같이 지나쳐도 하나만 저장 (유일 제약 → 409)', async () => {
    const { db, deps } = setup();
    const results = await Promise.allSettled([
        reportService.submitReport({ reporterId: ME, body: body() }, deps),
        reportService.submitReport({ reporterId: ME, body: body() }, deps),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'DUPLICATE_REPORT');
    assert.equal(db.reports.length, 1);
});

test('신고: 모양 틀린 요청은 400 INVALID_REPORT (모르는 칸·uuid·사유·긴 메모)', async () => {
    const { deps } = setup();
    const bads = [
        body({ targetUuid: 'x' }),
        body({ gameId: 'room-1' }),
        body({ reasonCode: 'HATE' }),
        body({ memo: 'a'.repeat(501) }),
        body({ memo: 3 }),
        { ...body(), reporterId: OTHER },
    ];
    for (const bad of bads) await rejectsWith(reportService.submitReport({ reporterId: ME, body: bad }, deps), 'INVALID_REPORT');
    await rejectsWith(reportService.submitReport({ reporterId: ME, body: null }, deps), 'INVALID_REPORT');
});

test('신고: 사유 목록 6개 전부 받음', async () => {
    assert.deepEqual([...reportService.REPORT_REASON_CODES], ['ABUSE', 'SPAM', 'GRIEFING', 'CHEATING', 'NICKNAME', 'ETC']);
    for (const reasonCode of reportService.REPORT_REASON_CODES) {
        const { deps } = setup();
        await reportService.submitReport({ reporterId: ME, body: body({ reasonCode }) }, deps);
    }
});

test('신고 + 채팅 증거: 보관된 판 채팅이 있으면 신고 id로 증거 한 줄 저장', async () => {
    const messages = [{ at: '2026-11-09T00:00:00.000Z', channel: 'DAY', senderUuid: TARGET, nickname: '대상', text: '나쁜말' }];
    const { db, deps } = setup({ messages });
    const result = await reportService.submitReport({ reporterId: ME, body: body() }, deps);
    assert.equal(result.evidenceSaved, true);
    assert.equal(db.evidence.length, 1);
    assert.equal(db.evidence[0].report_id, result.reportId);
    assert.equal(db.evidence[0].game_id, LIVE_GAME);
    assert.deepEqual(db.evidence[0].messages, messages);
});

test('신고 + 채팅 증거: 보관된 채팅 없으면 증거 안 씀 (신고는 저장)', async () => {
    const { db, deps } = setup({ messages: [] });
    const result = await reportService.submitReport({ reporterId: ME, body: body() }, deps);
    assert.equal(result.evidenceSaved, false);
    assert.equal(db.evidence.length, 0);
    assert.equal(db.reports.length, 1);
});

test('신고 + 채팅 증거: 증거 저장이 실패해도 신고는 남고 로그엔 오류 이름만', async (t) => {
    const lines = captureConsole(t);
    const { db, deps } = setup({ messages: [{ text: '비밀 채팅 내용' }] });
    db.hooks.evidenceFails = true;
    const result = await reportService.submitReport({ reporterId: ME, body: body() }, deps);
    assert.equal(result.evidenceSaved, false);
    assert.equal(db.reports.length, 1);
    assert.ok(!lines.join('\n').includes('비밀 채팅 내용'));
});

test('신고 처리기: 로그인 uuid로만 접수하고 201 + reportId (본문 신고자 무시)', async (t) => {
    t.mock.method(reportService, 'submitReport', async ({ reporterId }) => { assert.equal(reporterId, ME); return { reportId: 7 }; });
    const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(b) { this.body = b; return this; } };
    await playerController.submitReport({ user: { uuid: ME }, body: body() }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { ok: true, reportId: 7 });
});

test('신고 경로: 한 사람 1분 5번 넘으면 429 + 문구', async (t) => {
    const app = express();
    app.use((req, res, next) => { req.user = { uuid: ME }; next(); });
    app.post('/reports', createRateLimiter({ windowMs: 60_000, max: 5, keyOf: (req) => `report:${req.user.uuid}`, message: '신고가 너무 많습니다.' }), (req, res) => res.json({ ok: true }));
    const server = http.createServer(app);
    const url = await listenOnFetchableUrl(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const statuses = [];
    let last;
    for (let i = 0; i < 6; i += 1) {
        const response = await fetch(`${url}/reports`, { method: 'POST' });
        statuses.push(response.status);
        last = await response.json();
    }
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    assert.equal(last.message, '신고가 너무 많습니다.');
});

test('신고 경로: report 라우터 POST / 가 로그인·제한·처리기 셋', () => {
    const router = require('../../routes/report.routes');
    const layer = router.stack.find((l) => l.route?.path === '/');
    assert.equal(layer.route.methods.post, true);
    assert.equal(layer.route.stack.length, 3);
});
