'use strict';

// 신고 때만 남는 판 채팅 증거 DB 시험: 채팅은 진짜 소켓 처리기로 보내고, 신고 접수 뒤 reports·report_chat_evidence 줄을 봄
// 목록 A06-B-091~100, 돌리기(저장소 쪽 잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a06-chat-evidence.integration.test.js
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const db = require('../../models');
// 모델을 먼저 불러 시험 DB에 붙인 뒤 판 도우미를 부름 (gameFixtures가 DB 주소를 막는 줄이 모델 연결을 못 바꾸게)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const chatBuffer = require('../../services/ops/chatBuffer');
const bannedWords = require('../../services/ops/bannedWords');
const reportService = require('../../services/ops/report');
const { maybeResolveTribunal } = require('../../socket/gameSession/departure/autoResolve');

const T = gs.__testables;
const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });
const MIN = 60_000;

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    await db.sequelize.close();
});

// 밤에 죽은 것과 같은 모양으로 만듦 (판 참여는 그대로)
const kill = (session, uuid) => {
    const p = session.players.get(uuid);
    p.alive = false;
    p.deathReason = 'ASSASSINATION';
};

// 시험마다 새 사람 n명 (신고 표가 users를 가리켜 진짜 줄이 있어야 함)
async function createUsers(n) {
    const players = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        const nickname = `c${i}${uuid.slice(0, 6)}`;
        await db.User.create({ uuid, password_hash: 'not-a-real-hash', nickname, email: `c-${uuid}@example.test` });
        players.push({ uuid, nickname, isReady: true });
    }
    return players;
}

// 판 하나 열기: 진짜 사람 uuid·판 id(uuid 모양, 신고 검사가 봄), 직업 고정(randomFn 0)
async function openGame({ n, roleCounts }) {
    const players = await createUsers(n);
    const gameId = crypto.randomUUID();
    const settings = roleCounts
        ? { maxPlayers: 10, jokerCount: roleCounts.JOKER, roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts } }
        : { jokerCount: 1 };
    const room = { id: `room-${gameId}`, players: new Map(players.map((p) => [p.uuid, p])), settings };
    const candidate = gf.T.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => gameId });
    assert.equal(candidate.ok, true, `판 후보 실패: ${candidate.reason}`);
    gf.core.commitGameSession(candidate.session);
    gf.toDay(candidate.session);
    return candidate.session;
}

// 판 차리기 + 가짜 시계(채팅 간격·보관 시간이 Date를 봄 → Date만 가짜로)
async function table(t, opts) {
    gf.resetCore();
    chatBuffer.__resetForTests();
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 16, 3, 0, 0) });
    const session = await openGame(opts);
    const world = gf.socketWorld(gs, session);
    t.after(() => {
        gf.resetCore();
        chatBuffer.__resetForTests();
        bannedWords.__setWordsForTests([]);
    });
    return { session, world };
}

// 채팅 보내기 (보낼 때마다 0.6초 넘겨 간격 걸림 막음)
async function say(t, world, session, uuid, text) {
    const r = await gf.call(T.handleSubmitGameChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text });
    t.mock.timers.tick(600);
    return r;
}
async function sayRole(t, world, session, uuid, text) {
    const r = await gf.call(T.handleSubmitJokerChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text });
    t.mock.timers.tick(600);
    return r;
}

// 신고 접수 (POST /reports 처리기가 부르는 접수 함수)
const report = (reporterId, targetUuid, gameId) => reportService.submitReport({
    reporterId,
    body: { targetUuid, gameId, reasonCode: 'ABUSE' },
});

// DB 줄 보기
const reportRows = (gameId) => db.Report.findAll({ where: { game_id: gameId }, raw: true });
async function evidenceRows(gameId) {
    const rows = await db.ReportChatEvidence.findAll({ where: { game_id: gameId } });
    return rows.map((row) => {
        const messages = row.get('messages');
        return { reportId: row.get('report_id'), messages: typeof messages === 'string' ? JSON.parse(messages) : messages };
    });
}

// 광대를 재판에 세워 모두 유죄 → 시민 승으로 판 끝 (결과 화면 상태)
function endByExecutingJoker(session) {
    const joker = gf.firstOf(session, 'JOKER');
    gf.toTribunal(session, joker);
    for (const uuid of gf.nonJokers(session).filter((u) => session.players.get(u).alive)) {
        const r = gf.core.submitTribunalVote(uuid, session.id, session.dayIndex, 'GUILTY');
        assert.equal(r.ok, true, `재판 표 실패: ${r.code}`);
    }
    const prepared = gf.core.prepareTribunalVoteResolution(gf.nonJokers(session)[0], session.id, session.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    gf.core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(session.phase, 'ENDED');
}

// 위와 같되 판정을 서버가 하는 길(재판 마감 판정)로 → 판 끝 뒷일(채팅 보관 끝 표시)까지 돎, 판은 결과 화면에 그대로 남음
// 전적 저장·업적은 이 시험 밖이라 가짜로, 판 끝 180초 시계는 시험 끝에 끔
function endByTribunalDeadline(t, world, session) {
    T.__setGameResultPersistForTests(async () => ({ ok: true }));
    T.__setEvaluateAchievementsForTests(async () => {});
    t.after(() => {
        gs.__resetStateForTests();
        T.__setGameResultPersistForTests(null);
        T.__setEvaluateAchievementsForTests(null);
    });
    const joker = gf.firstOf(session, 'JOKER');
    gf.toTribunal(session, joker);
    for (const uuid of gf.nonJokers(session).filter((u) => session.players.get(u).alive)) {
        const r = gf.core.submitTribunalVote(uuid, session.id, session.dayIndex, 'GUILTY');
        assert.equal(r.ok, true, `재판 표 실패: ${r.code}`);
    }
    assert.equal(maybeResolveTribunal(world.io, session), true, '재판 판정 안 됨');
    assert.equal(session.phase, 'ENDED');
    assert.ok(gf.core.getEndedGameId(joker) === session.id, '판이 결과 화면에 안 남음');
}

test('A06-B-091 신고가 없으면 채팅이 DB에 안 남음: 낮·밤·죽은 사람 채팅 뒤 판 끝·10분 → 증거 0줄', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 6 });
    const [a, b] = gf.byRole(session, 'CITIZEN');
    kill(session, b);
    assert.equal((await say(t, world, session, a, '낮 글')).ok, true);
    assert.equal((await say(t, world, session, b, '죽은 사람 글')).ok, true);
    gf.toNight(session);
    assert.equal((await sayRole(t, world, session, gf.firstOf(session, 'DOCTOR'), '의사 글')).ok, true);
    // 밤은 모두 건너뛰기로 판정 → 다음 낮에 광대 처형으로 판 끝
    gf.skipAllNight(session);
    assert.equal(gf.resolveNightDirect(session).committed?.ok, true);
    assert.equal(session.phase, 'DAY');
    endByExecutingJoker(session);
    t.mock.timers.tick(10 * MIN);
    assert.equal((await evidenceRows(session.id)).length, 0);
    assert.equal((await reportRows(session.id)).length, 0);
});

test('A06-B-092 판 중 신고하면 그 판 채팅 묶음 1줄, messages에 낮 채팅 3줄 원문 (6명)', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 6 });
    const [a, b] = gf.nonJokers(session);
    for (const text of ['하나', '둘', '셋']) assert.equal((await say(t, world, session, a, text)).ok, true);
    const result = await report(b, a, session.id);
    assert.ok(result.reportId);
    const rows = await evidenceRows(session.id);
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].reportId), String(result.reportId));
    assert.deepEqual(rows[0].messages.map((m) => m.text), ['하나', '둘', '셋']);
});

test('A06-B-093 증거는 금지어 가리기 전 원문: 받은 글 "너 **야", 증거 글 "너 바보야" (5명)', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 5 });
    bannedWords.__setWordsForTests(['바보']);
    const [a, b] = gf.nonJokers(session);
    assert.equal((await say(t, world, session, a, '너 바보야')).ok, true);
    assert.equal(world.received(b, 'day_chat_message_received')[0].payload.text, '너 **야');
    await report(b, a, session.id);
    const [row] = await evidenceRows(session.id);
    assert.deepEqual(row.messages.map((m) => m.text), ['너 바보야']);
});

test('A06-B-094 다른 판 채팅 안 섞임: 판 1 신고 증거에 판 2 글 0줄 (5명·6명 판 동시)', async (t) => {
    if (noDb(t)) return;
    gf.resetCore();
    chatBuffer.__resetForTests();
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 16, 3, 0, 0) });
    const g1 = await openGame({ n: 5 });
    const g2 = await openGame({ n: 6 });
    const w1 = gf.socketWorld(gs, g1);
    const w2 = gf.socketWorld(gs, g2);
    // 두 판 사람 모두 지금 소켓으로 등록 (socketWorld는 부를 때마다 등록 목록을 갈아 끼움)
    gs.setOnlineUsersRegistry(new Map([...w1.registry, ...w2.registry]));
    t.after(() => { gf.resetCore(); chatBuffer.__resetForTests(); });
    const [a1, b1] = gf.nonJokers(g1);
    const [a2] = gf.nonJokers(g2);
    assert.equal((await say(t, w1, g1, a1, '판1 글')).ok, true);
    assert.equal((await say(t, w2, g2, a2, '판2 글')).ok, true);
    await report(b1, a1, g1.id);
    const [row] = await evidenceRows(g1.id);
    assert.deepEqual(row.messages.map((m) => m.text), ['판1 글']);
    assert.equal(row.messages.filter((m) => m.text === '판2 글').length, 0);
});

test('A06-B-095 거절된 글(밤 시민 글·151자 글·0.3초 연달아 글)은 증거에 없음 (6명)', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 6 });
    const [a, b, c] = gf.byRole(session, 'CITIZEN');
    // 정상 글 하나 → 0.3초 뒤 또 (간격 걸림)
    assert.equal((await gf.call(T.handleSubmitGameChatMessage, world.io, world.sock(a), a, { gameId: session.id, text: '정상 글' })).ok, true);
    t.mock.timers.tick(300);
    const fast = await gf.call(T.handleSubmitGameChatMessage, world.io, world.sock(a), a, { gameId: session.id, text: '연달아 글' });
    assert.equal(fast.code, 'RATE_LIMITED');
    const long = await say(t, world, session, b, '긴'.repeat(151));
    assert.equal(long.code, 'MESSAGE_TOO_LONG');
    gf.toNight(session);
    const citizenNight = await sayRole(t, world, session, c, '밤 시민 글');
    assert.equal(citizenNight.code, 'NOT_ELIGIBLE');
    await report(b, a, session.id);
    const [row] = await evidenceRows(session.id);
    assert.deepEqual(row.messages.map((m) => m.text), ['정상 글']);
});

test('A06-B-096 결과 화면에서 신고해도 증거 남음: 판 끝 1분 뒤 신고 → 증거 1줄 (5명)', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 5 });
    const [a, b] = gf.nonJokers(session);
    assert.equal((await say(t, world, session, a, '판 중 글')).ok, true);
    endByExecutingJoker(session);
    t.mock.timers.tick(1 * MIN);
    const result = await report(b, a, session.id);
    assert.equal(result.evidenceSaved, true);
    assert.equal((await evidenceRows(session.id)).length, 1);
});

test('A06-B-097 판 끝 10분 1초 뒤 신고 → reports 1줄, 증거 0줄, 답 evidenceSaved false (5명)', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 5 });
    const [a, b] = gf.nonJokers(session);
    assert.equal((await say(t, world, session, a, '판 중 글')).ok, true);
    // 판을 지우지 않고 결과 화면에 둔 채로 10분 1초 (끝 표시는 승패가 난 때 붙음)
    endByTribunalDeadline(t, world, session);
    t.mock.timers.tick(10 * MIN + 1_000);
    const result = await report(b, a, session.id);
    assert.equal((await reportRows(session.id)).length, 1);
    assert.equal((await evidenceRows(session.id)).length, 0);
    assert.equal(result.evidenceSaved, false);
});

test('A06-B-098 채팅 없는 판 신고 → 신고 1줄, 증거 0줄 (5명)', async (t) => {
    if (noDb(t)) return;
    const { session } = await table(t, { n: 5 });
    const [a, b] = gf.nonJokers(session);
    const result = await report(b, a, session.id);
    assert.ok(result.reportId);
    assert.equal((await reportRows(session.id)).length, 1);
    assert.equal((await evidenceRows(session.id)).length, 0);
});

test('A06-B-099 같은 판 같은 대상 두 번 신고 → 두 번째 DUPLICATE_REPORT, 증거 1줄 그대로 (6명)', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 6 });
    const [a, b] = gf.nonJokers(session);
    assert.equal((await say(t, world, session, a, '신고당할 글')).ok, true);
    await report(b, a, session.id);
    await assert.rejects(report(b, a, session.id), { code: 'DUPLICATE_REPORT' });
    assert.equal((await reportRows(session.id)).length, 1);
    assert.equal((await evidenceRows(session.id)).length, 1);
});

test('A06-B-100 증거 줄마다 at·channel(DAY·DEAD·DOCTOR)·보낸 사람·닉네임·글 (8명)', async (t) => {
    if (noDb(t)) return;
    const { session, world } = await table(t, { n: 8 });
    const [alive, dead, reporter] = gf.byRole(session, 'CITIZEN');
    const doctor = gf.firstOf(session, 'DOCTOR');
    kill(session, dead);
    assert.equal((await say(t, world, session, alive, '낮 글')).ok, true);
    assert.equal((await say(t, world, session, dead, '죽은 사람 글')).ok, true);
    gf.toNight(session);
    assert.equal((await sayRole(t, world, session, doctor, '의사 글')).ok, true);
    await report(reporter, alive, session.id);
    const [row] = await evidenceRows(session.id);
    const nick = (uuid) => session.players.get(uuid).nickname;
    assert.deepEqual(
        row.messages.map(({ channel, senderUuid, nickname, text }) => ({ channel, senderUuid, nickname, text })),
        [
            { channel: 'DAY', senderUuid: alive, nickname: nick(alive), text: '낮 글' },
            { channel: 'DEAD', senderUuid: dead, nickname: nick(dead), text: '죽은 사람 글' },
            { channel: 'DOCTOR', senderUuid: doctor, nickname: nick(doctor), text: '의사 글' },
        ],
    );
    // 보낸 시각: 글자 시각(ISO)으로 읽힘
    for (const m of row.messages) assert.ok(!Number.isNaN(Date.parse(m.at)), `시각 못 읽음: ${m.at}`);
});
