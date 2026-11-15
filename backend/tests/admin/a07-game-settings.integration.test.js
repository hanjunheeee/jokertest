'use strict';

// 관리자 판 골드 값 시험: 진짜 관리자 경로(/admin-api/game-settings)로 보기·바꾸기 → 값 경계·몸 모양·표·감사 기록·로그인·쓰기 확인·이 서버 값·판 값을 시험 DB에서 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-B-217~239 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

// 모델을 먼저 불러 시험 DB에 붙여 둠 (gameFixtures가 DATABASE_URL을 막는 값으로 바꾸기 전에)
const db = require('../../models');
const { prepareAdminDb, adminTestApp, createAgent, randomIp } = require('./helpers/adminTestApp');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const mf = require('../helpers/matchmakingFixtures');
const gameSettings = require('../../services/ops/gameSettings');
const persistModule = require('../../services/game/record/persist');
const { getSessionById } = require('../../game-core/queries/byId');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const { core } = gf;
const T = gs.__testables;
const M = matchmaking.__testables;
const KEY = 'GAME_GOLD_REWARD';
const PATH = '/admin-api/game-settings';

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

// 파일 하나에 시험 DB 한 번 비우기 + 로그인된 관리자 앱 하나
let prepared = null;
let app = null;
test.before(async () => {
    if (!TEST_DB_URL) return;
    prepared = await prepareAdminDb();
    app = await adminTestApp();
});

test.after(async () => {
    if (app) await app.close();
    gs.__resetStateForTests();
    matchmaking.__resetStateForTests();
    if (prepared) await prepared.close();
});

// ── 이 파일 안 작은 도우미 (공용 도우미는 안 고침) ──

// 시험마다 시작 값: 표 1·이 서버 값 1, 끝에 이 서버 값 처음대로
async function freshStart(t, value = 1) {
    await setTableValue(value);
    gameSettings.__setGoldRewardForTests(value);
    t.after(() => gameSettings.__setGoldRewardForTests());
}

// 표 값 직접 넣기 (관리자 경로 말고, 줄 없으면 만듦)
async function setTableValue(value) {
    const [row] = await db.GameSetting.findOrCreate({ where: { key: KEY }, defaults: { key: KEY, value_int: value } });
    await row.update({ value_int: value });
}

const tableRow = () => db.GameSetting.findOne({ where: { key: KEY }, raw: true });
const auditRows = () => db.AdminAuditLog.findAll({ where: { action: 'GAME_SETTING_UPDATE', target_id: KEY }, order: [['id', 'ASC']], raw: true });
const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const put = (body, options) => app.agent.request('PUT', PATH, { ...options, body });

// 400 거절 모양: INVALID_INPUT + 걸린 칸 이름
function assertInvalid(res, field) {
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_INPUT');
    assert.equal(res.body.field, field);
}

// 방 만들기 → 5명 입장·준비 → 방장 시작 (화면이 보내는 요청 그대로) → 판 끝까지(광대 승) → 판 끝 칸 사람마다 goldReward
// 판 기록·지급은 가짜 (이 시험은 판 값만 봄, 가짜 계정이라 DB에 안 씀)
async function playRoomGame(t) {
    gf.resetCore();
    gs.__resetStateForTests();
    matchmaking.__resetStateForTests();
    t.mock.method(Math, 'random', () => 0);
    mf.installFakeMatchmakingDeps(matchmaking);
    T.__setGameResultPersistForTests(async () => {});
    persistModule.__setGameGoldGrantForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    const io = mf.createFakeIo([]);
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        T.__setGameResultPersistForTests(null);
        persistModule.__setGameGoldGrantForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        gf.resetCore();
    });
    const uuids = Array.from({ length: 5 }, (_, i) => `a07adm-${Date.now().toString(36)}-${i}`);
    const sockets = new Map(uuids.map((u) => [u, mf.createFakeSocket(u)]));
    for (const [u, sk] of sockets) {
        io.sockets.sockets.set(sk.id, sk);
        registry.set(u, sk.id);
    }
    const [host, ...guests] = uuids;
    const created = await mf.callAsPromise(M.handleCreateRoom, io, sockets.get(host), host,
        mf.validSettingsPayload({ maxPlayers: 5, jokerCount: 1, accessType: 'code' }));
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code}`);
    for (const g of guests) await M.handleJoinRoomByCode(io, sockets.get(g), g, created.room.roomCode);
    for (const u of uuids) {
        const r = await mf.callAsPromise(M.handleSetReady, io, sockets.get(u), u, mf.readyPayload(created.room));
        assert.equal(r.ok, true, `준비 실패: ${r.code}`);
    }
    const started = await mf.callAsPromise(M.handleStartGame, io, sockets.get(host), host, mf.startPayload(created.room));
    assert.equal(started.ok, true, `시작 실패: ${started.code}`);
    const s = getSessionById(started.gameId);
    T.stopRoleRevealTimer(s.id);
    gf.toDay(s);
    // 밤마다 광대가 시민을 죽여 광대 승 (서버 밤 마무리 길 → 판 끝 칸이 방송에 실림)
    for (let i = 0; i < 6 && s.phase !== 'ENDED'; i += 1) {
        T.stopNightTurnSequence(s.id);
        T.stopDayPhaseTimer(s.id);
        gf.toNight(s);
        const joker = gf.firstOf(s, 'JOKER');
        const victim = [...s.players.values()].find((p) => p.alive && p.role !== 'JOKER').uuid;
        assert.equal(core.submitNightAction(joker, s.id, victim).ok, true);
        gf.skipAllNight(s);
        assert.equal(T.finalizeNightForSession(io, s).ok, true);
    }
    assert.equal(s.phase, 'ENDED');
    const ended = sockets.get(gf.firstOf(s, 'JOKER')).received.find((e) => e.event === 'night_result_applied' && e.payload?.winResult);
    assert.ok(ended, '판 끝 칸이 실린 밤 결과 알림');
    return new Map(ended.payload.winResult.reveals.map((r) => [r.uuid, r.goldReward]));
}

// ── A07-B-217~227: 값 경계 ──

const VALUE_EDGES = [
    ['217', '−1', { goldReward: -1 }, 400],
    ['218', '0', { goldReward: 0 }, 200],
    ['219', '1', { goldReward: 1 }, 200],
    ['220', '50', { goldReward: 50 }, 200],
    ['221', '99', { goldReward: 99 }, 200],
    ['222', '100', { goldReward: 100 }, 200],
    ['223', '101', { goldReward: 101 }, 400],
    ['224', '1.5', { goldReward: 1.5 }, 400],
    ['225', '글자 "2"', { goldReward: '2' }, 400],
    ['226', 'null', { goldReward: null }, 400],
    ['227', '칸 없음', {}, 400],
];
for (const [no, label, body, status] of VALUE_EDGES) {
    const expect = status === 400 ? '400 INVALID_INPUT·field goldReward' : '200';
    test(`A07-B-${no} PUT goldReward = ${label} → ${expect}`, async (t) => {
        if (noDb(t)) return;
        await freshStart(t, 7);
        const res = await put(body);
        if (status === 400) {
            assertInvalid(res, 'goldReward');
            assert.equal((await tableRow()).value_int, 7, '거절이면 표 그대로');
        } else {
            assert.equal(res.status, 200);
            assert.equal(res.body.ok, true);
            assert.equal(res.body.settings.goldReward, body.goldReward);
            assert.equal((await tableRow()).value_int, body.goldReward);
        }
    });
}

// ── A07-B-228~229: 몸 모양 ──

test('A07-B-228 { goldReward:2, extra:1 } → 400 field extra', async (t) => {
    if (noDb(t)) return;
    await freshStart(t);
    assertInvalid(await put({ goldReward: 2, extra: 1 }), 'extra');
    assert.equal((await tableRow()).value_int, 1);
});

test('A07-B-229 몸이 배열 → 400 field body', async (t) => {
    if (noDb(t)) return;
    await freshStart(t);
    assertInvalid(await put([2]), 'body');
    assert.equal((await tableRow()).value_int, 1);
});

// ── A07-B-230~233: 표·감사 기록 ──

test('A07-B-230 1 → 2 → game_settings GAME_GOLD_REWARD 값 2, updated_by = 관리자 id', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    assert.equal((await put({ goldReward: 2 })).status, 200);
    const row = await tableRow();
    assert.equal(row.value_int, 2);
    assert.equal(row.updated_by, app.admin.id);
});

test('A07-B-231 1 → 2 → admin_audit_logs에 GAME_SETTING_UPDATE 한 줄, 바꾸기 전 1·뒤 2', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    const before = (await auditRows()).length;
    assert.equal((await put({ goldReward: 2 })).status, 200);
    const rows = await auditRows();
    assert.equal(rows.length, before + 1);
    const last = rows[rows.length - 1];
    assert.equal(last.admin_id, app.admin.id);
    assert.deepEqual(parseJson(last.before_value), { goldReward: 1 });
    assert.deepEqual(parseJson(last.after_value), { goldReward: 2 });
});

test('A07-B-232 2 → 2 같은 값 다시 저장 → 200, 감사 기록 한 줄 더', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 2);
    const before = (await auditRows()).length;
    const res = await put({ goldReward: 2 });
    assert.equal(res.status, 200);
    assert.equal((await auditRows()).length, before + 1);
});

test('A07-B-233 101 → 400 뒤 표 값·감사 기록 수 그대로', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 3);
    const before = (await auditRows()).length;
    assertInvalid(await put({ goldReward: 101 }), 'goldReward');
    assert.equal((await tableRow()).value_int, 3);
    assert.equal((await auditRows()).length, before);
});

// ── A07-B-234~236: 보기·로그인·쓰기 확인 ──

test('A07-B-234 GET → settings.goldReward = 표 값, limits.goldReward {0,100}, 이 서버 값', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    await setTableValue(4);
    const res = await app.agent.get(PATH);
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.goldReward, 4);
    assert.deepEqual(res.body.limits.goldReward, { min: 0, max: 100 });
    // 이 서버가 들고 있는 값 (표를 손으로 바꿨으니 아직 1)
    assert.equal(res.body.node.goldReward, 1);
});

test('A07-B-235 관리자 로그인 없음 → 거절, 표 그대로', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    const stranger = createAgent({ url: app.url, ip: randomIp() });
    const res = await stranger.request('PUT', PATH, { body: { goldReward: 9 } });
    assert.ok(res.status === 401 || res.status === 403, `거절 상태 ${res.status}`);
    assert.equal((await tableRow()).value_int, 1);
});

test('A07-B-236 쓰기 확인값(CSRF) 없음 → 거절, 표 그대로', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    const res = await put({ goldReward: 9 }, { headers: { 'x-admin-csrf': undefined } });
    assert.ok(res.status === 401 || res.status === 403, `거절 상태 ${res.status}`);
    assert.equal((await tableRow()).value_int, 1);
});

// ── A07-B-237~239: 이 서버 값·판 값 ──

test('A07-B-237 2로 바꿈 → 이 서버 메모리 값 2 → 그 뒤 시작한 판(5명) goldReward 2', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    assert.equal((await put({ goldReward: 2 })).status, 200);
    assert.equal((await app.agent.get(PATH)).body.node.goldReward, 2);
    const gold = await playRoomGame(t);
    assert.equal(gold.size, 5);
    for (const [uuid, value] of gold) assert.equal(value, 2, uuid);
});

test('A07-B-238 game_settings 비움 → GET 1, 판 값 1', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    // 먼저 5로 바꿔 이 서버 값도 5로 만든 뒤 표를 비움
    assert.equal((await put({ goldReward: 5 })).status, 200);
    await db.GameSetting.destroy({ where: {} });
    // 서버 켤 때 읽기와 같은 다시 읽기
    await gameSettings.reloadGameSettings();
    const res = await app.agent.get(PATH);
    assert.equal(res.body.settings.goldReward, 1);
    assert.equal(res.body.node.goldReward, 1);
    const gold = await playRoomGame(t);
    for (const [uuid, value] of gold) assert.equal(value, 1, uuid);
});

test('A07-B-239 표에 손으로 150 → 다시 읽기 → 서버 값 쓰던 값 그대로', async (t) => {
    if (noDb(t)) return;
    await freshStart(t, 1);
    assert.equal((await put({ goldReward: 2 })).status, 200);
    await setTableValue(150);
    await gameSettings.reloadGameSettings();
    const res = await app.agent.get(PATH);
    assert.equal(res.body.node.goldReward, 2);
});
