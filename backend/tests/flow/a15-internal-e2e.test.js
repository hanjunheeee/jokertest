'use strict';

// 안쪽 전용 경로(/internal)·시험 손잡이(/e2e) 시험 — 열쇠 없이는 안 열림, 짧은 열쇠면 경로 꺼짐, 요청 수 제한, 현황에 사람 정보 없음
// 목록 A15-B-182·204·205·233~239 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-internal-e2e.test.js

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 → 서버 모듈보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const test = require('node:test');
const assert = require('node:assert/strict');
const morgan = require('morgan');

const matchmaking = require('../../socket/matchmaking');
const mf = require('../helpers/matchmakingFixtures');
const desertion = require('../../services/game/desertion');
const { createInternalRouter } = require('../../routes/internal.routes');
const { createE2eRouter } = require('../../routes/e2e.routes');
const { safeRequestPath, getClientIp } = require('../../utils/request');
const { startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');

// 시험 안에서만 쓰는 가짜 열쇠 (40자), 틀린 열쇠는 끝 한 글자만 다름
const KEY = 'a15-test-only-internal-key-0123456789abc';
const WRONG_KEY = `${KEY.slice(0, -1)}x`;
const keyHeader = (key) => ({ 'x-internal-key': key });
const from = (ip) => ({ 'x-forwarded-for': ip });

// /internal 라우터 하나 붙인 서버 (env 객체는 시험이 쥐고 바꿀 수 있음)
const startInternal = (t, env) => startRouterServer(t, [['/internal', createInternalRouter({ env })]]);

// 판·방 장부 비우기 (시험 끝나면 다시 비움)
const cleanBoards = (t) => {
    gf.resetCore();
    matchmaking.__resetStateForTests();
    // 탈주 기록은 DB 대신 빈 값 (대기방 입장이 읽음)
    desertion.__setRepositoryForTests({
        countDesertionsSince: async () => 0,
        insertDesertion: async () => ({ created: true, row: null }),
        findDesertionsForWarmup: async () => [],
    });
    t.after(() => {
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
        gf.resetCore();
        matchmaking.__resetStateForTests();
        matchmaking.__setUserRepositoryForTests(null);
        matchmaking.__setEconomyServiceForTests(null);
        matchmaking.__setGameResultRepositoryForTests(null);
        matchmaking.__setGameInviteServiceForTests(null);
    });
};

// ── 안쪽 전용 현황 ──

test('A15-B-182 진행 판 1개(6명)·대기방 1개 → 맞는 열쇠로 GET /internal/live → 판·방 수·인원 수만, 닉네임·uuid 명단·직업 없음', async (t) => {
    cleanBoards(t);
    // 6명 판: 광대 1·의사 1·시민 4 (직업 정해 줌)
    const session = gf.startGame({ id: 'room-live-182', prefix: 'p182', gameId: 'game-live-182', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    // 대기방: 정원 5에 5명 (방장·참가자·채우는 사람 3)
    mf.installFakeMatchmakingDeps(matchmaking);
    const io = mf.createFakeIo([]);
    const ready = await mf.setupReadyRoomForStart(io, 'w182host', 'w182join', matchmaking.__testables);
    assert.ok(ready.room?.roomId, '대기방 못 만듦 (준비 실패)');

    const base = await startInternal(t, { INTERNAL_API_KEY: KEY });
    const res = await json(await send(base, 'GET', '/internal/live', { headers: keyHeader(KEY) }));
    assert.equal(res.status, 200);
    assert.equal(res.body.gameCount, 1);
    assert.equal(res.body.roomCount, 1);
    assert.equal(res.body.games[0].playerCount, 6);
    assert.equal(res.body.rooms[0].playerCount, 5);

    const people = [...session.players.values()];
    const roomPeople = ['w182host', 'w182join', 'w182host-fill-1', 'w182host-fill-2', 'w182host-fill-3'];
    for (const p of people) {
        assert.ok(!res.text.includes(p.uuid), `판 사람 uuid가 실림: ${p.uuid}`);
        assert.ok(!res.text.includes(p.nickname), `판 사람 닉네임이 실림: ${p.nickname}`);
    }
    for (const uuid of roomPeople) assert.ok(!res.text.includes(uuid), `대기방 사람 uuid가 실림: ${uuid}`);
    assert.doesNotMatch(res.text, /닉/, '닉네임 글자가 실림');
    assert.doesNotMatch(res.text, /JOKER|DOCTOR|CITIZEN|GUARD|WITCH_HUNTER/, '직업이 실림');
    assert.doesNotMatch(res.text, /"(nickname|role|players|uuid)"/, '명단 칸이 실림');
});

// ── 안쪽 전용 ip 1분 120번 ──

test('A15-B-204 안쪽 전용 ip 1분 120번 — 맞는 열쇠 121번째 → 429', async (t) => {
    const base = await startInternal(t, { INTERNAL_API_KEY: KEY });
    let res;
    for (let i = 1; i <= 120; i += 1) res = await send(base, 'GET', '/internal/live', { headers: { ...keyHeader(KEY), ...from('198.51.100.204') } });
    assert.equal(res.status, 200, '120번째가 이미 막힘 (준비 실패)');
    const last = await json(await send(base, 'GET', '/internal/live', { headers: { ...keyHeader(KEY), ...from('198.51.100.204') } }));
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

test('A15-B-205 틀린 열쇠도 셈 — 틀린 열쇠 120번 뒤 맞는 열쇠 → 429', async (t) => {
    const base = await startInternal(t, { INTERNAL_API_KEY: KEY });
    for (let i = 1; i <= 120; i += 1) {
        const res = await send(base, 'GET', '/internal/live', { headers: { ...keyHeader(WRONG_KEY), ...from('198.51.100.205') } });
        assert.equal(res.status, 401, `틀린 열쇠 ${i}번째가 401 아님`);
    }
    const last = await json(await send(base, 'GET', '/internal/live', { headers: { ...keyHeader(KEY), ...from('198.51.100.205') } }));
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

// ── 열쇠 ──

test('A15-B-233 설정 키 31자면 경로 전체 꺼짐 — GET /internal/live 404(없는 경로와 같은 본문), 요청 수에도 안 셈', async (t) => {
    const env = { INTERNAL_API_KEY: 'k'.repeat(31) };
    const base = await startInternal(t, env);
    const off = await json(await send(base, 'GET', '/internal/live', { headers: { ...keyHeader(env.INTERNAL_API_KEY), ...from('198.51.100.233') } }));
    const missing = await json(await send(base, 'GET', '/no-such-path-233', { headers: from('198.51.100.233') }));
    assert.equal(off.status, 404);
    assert.deepEqual(off.body, missing.body);
    // 꺼진 동안 120번 더 → 셌다면 키를 켠 뒤 첫 요청이 121번째라 429
    for (let i = 0; i < 120; i += 1) await send(base, 'GET', '/internal/live', { headers: { ...keyHeader(env.INTERNAL_API_KEY), ...from('198.51.100.233') } });
    env.INTERNAL_API_KEY = KEY;
    const on = await send(base, 'GET', '/internal/live', { headers: { ...keyHeader(KEY), ...from('198.51.100.233') } });
    assert.equal(on.status, 200);
});

test('A15-B-234 X-Internal-Key 없이 → 401 INTERNAL_UNAUTHORIZED', async (t) => {
    const base = await startInternal(t, { INTERNAL_API_KEY: KEY });
    const res = await json(await send(base, 'GET', '/internal/live'));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INTERNAL_UNAUTHORIZED');
});

// index.js 요청 로그 줄과 같은 모양 (index.js가 형식을 안 내보내서 여기 적음)
const REQUEST_LOG_FORMAT = ':client-ip :method :safe-url :status :response-time ms';
morgan.token('client-ip', (req) => getClientIp(req));
morgan.token('safe-url', (req) => safeRequestPath(req));

test('A15-B-235 틀린 열쇠 → 401 같은 본문, 응답·요청 로그에 보낸 열쇠 글자 없음', async (t) => {
    const lines = [];
    const logger = morgan(REQUEST_LOG_FORMAT, { stream: { write: (line) => lines.push(line) } });
    // 서버가 찍는 다른 줄도 모음 (열쇠가 어디에도 안 찍히는지)
    for (const name of ['log', 'warn', 'info']) {
        const original = console[name];
        console[name] = (...args) => { lines.push(args.map(String).join(' ')); };
        t.after(() => { console[name] = original; });
    }
    const base = await startRouterServer(t, [['/', logger], ['/internal', createInternalRouter({ env: { INTERNAL_API_KEY: KEY } })]]);
    const noKey = await json(await send(base, 'GET', '/internal/live'));
    const wrong = await json(await send(base, 'GET', '/internal/live', { headers: keyHeader(WRONG_KEY) }));
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, noKey.body);
    assert.ok(!wrong.text.includes(WRONG_KEY), '응답에 보낸 열쇠가 실림');
    assert.ok(lines.length >= 2, '요청 로그 줄이 안 남음 (준비 실패)');
    const log = lines.join('\n');
    assert.ok(!log.includes(WRONG_KEY), '로그에 보낸 열쇠가 남음');
    assert.ok(!log.includes(WRONG_KEY.slice(0, 20)), '로그에 열쇠 조각이 남음');
});

test('A15-B-236 맞는 열쇠 → 200 + Cache-Control: no-store', async (t) => {
    const base = await startInternal(t, { INTERNAL_API_KEY: KEY });
    const res = await send(base, 'GET', '/internal/live', { headers: keyHeader(KEY) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

// ── 시험 손잡이 (/e2e) ──

const DEV_HOOKS_ENV = { NODE_ENV: 'development', E2E_HOOKS: '1', INTERNAL_API_KEY: KEY };
const startE2e = (t, env) => startRouterServer(t, [['/e2e', createE2eRouter({ env })]]);

test('A15-B-237 개발 + E2E_HOOKS=1, 열쇠 없이 GET /e2e/users/x/game → 401', async (t) => {
    const base = await startE2e(t, DEV_HOOKS_ENV);
    const res = await json(await send(base, 'GET', '/e2e/users/x/game'));
    assert.equal(res.status, 401);
});

test('A15-B-238 틀린 열쇠로 POST /e2e/games/<진행 판>/advance → 401, 판 단계 그대로', async (t) => {
    cleanBoards(t);
    const session = gf.startGame({ id: 'room-238', prefix: 'p238', gameId: 'game-238', n: 5, roleCounts: { JOKER: 1 } });
    const base = await startE2e(t, DEV_HOOKS_ENV);
    const before = await json(await send(base, 'GET', `/e2e/games/${session.id}`, { headers: keyHeader(KEY) }));
    assert.equal(before.status, 200, '판 요약 못 읽음 (준비 실패)');
    const res = await json(await send(base, 'POST', `/e2e/games/${session.id}/advance`, { headers: keyHeader(WRONG_KEY) }));
    assert.equal(res.status, 401);
    const after = await json(await send(base, 'GET', `/e2e/games/${session.id}`, { headers: keyHeader(KEY) }));
    assert.equal(after.body.game.phase, before.body.game.phase);
    assert.equal(after.body.game.dayIndex, before.body.game.dayIndex);
});

test('A15-B-239 개발 + E2E_HOOKS 없음 → /e2e/* 404 (맞는 열쇠여도)', async (t) => {
    const base = await startE2e(t, { NODE_ENV: 'development', INTERNAL_API_KEY: KEY });
    const missing = await json(await send(base, 'GET', '/no-such-path-239'));
    const read = await json(await send(base, 'GET', '/e2e/users/x/game', { headers: keyHeader(KEY) }));
    const write = await json(await send(base, 'POST', '/e2e/role-presets', { headers: keyHeader(KEY), body: { presets: { x: 'JOKER' } } }));
    assert.equal(read.status, 404);
    assert.equal(write.status, 404);
    assert.deepEqual(read.body, missing.body);
});
