'use strict';

// 판 중인 사람 정지 시험: 낮 투표 중 관리자가 정지 → 그 사람만 끊김·판 그대로·기록 / 다시 못 붙고 60초 뒤 판에서 빠짐·탈주로 안 침 (진짜 관리자 요청 + 진짜 연결 처리기 + 가짜 시계 + 시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-221~223, 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

// 모델을 세상 도우미보다 먼저 불러 시험 DB에 붙여 둠
const H = require('./a14-ops-helpers');
const { adminTestApp } = require('./helpers/adminTestApp');
const { issueSessionForUser } = require('../../services/auth/account/session');
const { authenticateSocket } = require('../../socket/connection/auth');
const { makeWorld } = require('../flow/a10-world');
const sessionCheckRepository = require('../../repositories/user/sessionCheck');
const desertion = require('../../services/game/desertion');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const { db } = H;
H.useAdminFile();

// 로그인 (진짜 세션 발급) → { token }
async function login(uuid) {
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(user, {}, { ip: '127.0.0.1' }, transaction));
    return issued.token;
}

// 접속 인증 한 번 → { err, socket }
function handshake(token) {
    const socket = { data: {}, handshake: { headers: { cookie: `accessToken=${token}` } } };
    return new Promise((resolve) => authenticateSocket(socket, (err) => resolve({ err, socket })));
}

// n명 회원 만들고 로그인·접속 → 낮 투표 단계 판 (광대 = 맨 끝 사람), 관리자 앱은 가짜 시계 뒤에 로그인
// 판 차리기 동안은 세상의 세션 검사 대역을 씀 (진짜 DB 검사는 답이 늦어 세상 도우미가 못 기다림), 다시 붙기 확인 때만 진짜로 돌려놓음
async function gameInDayVote(t, n) {
    // 끝에 가짜 시계를 맨 먼저 풂 (세상 정리보다 앞에 걺) → 소켓 정리·관리자 시험 서버 닫기가 진짜 시계로 끝남
    // 가짜 시계 그대로 두면 서버 닫기를 영영 기다려 프로세스가 안 끝났음
    t.after(() => t.mock.timers.reset());
    const w = makeWorld(t);
    const uuids = [];
    const tokens = new Map();
    for (let i = 0; i < n; i += 1) {
        const { uuid } = await H.createPlayer(`g${i}`);
        uuids.push(uuid);
        const token = await login(uuid);
        tokens.set(uuid, token);
        const { err, socket } = await handshake(token);
        assert.equal(err, undefined, `준비: 접속 거절 ${err?.message}`);
        await w.connect(uuid, { user: socket.data.user });
    }
    const g = await w.openGame({ n, uuids });
    await w.toDay(g);
    for (const uuid of uuids) await w.ask(uuid, 'ready_for_day_vote', { gameId: g.gameId });
    await w.settle();
    const admin = await adminTestApp({ t, admin: { loginId: `a14opsg${H.tag()}` } });
    return { w, g, uuids, tokens, admin };
}

const banWeek = (admin, uuid) => admin.agent.post(`/admin-api/members/${uuid}/bans`, { kind: 'PERIOD', days: 7, reason: '판 중 욕설' });

test('A14-B-221 6명 판 낮 투표 중 ㄴ 7일 정지 → ㄴ 소켓만 force_disconnect ACCOUNT_BANNED·끊김, 다른 5명 판 그대로, user_bans 1줄, 기록 BAN 1줄', async (t) => {
    if (H.noDb(t)) return;
    const { w, g, uuids, admin } = await gameInDayVote(t, 6);
    const victim = uuids[1];
    const others = uuids.filter((u) => u !== victim);
    const phase = w.phaseOf(g.gameId);
    const res = await banWeek(admin, victim);
    await w.settle();
    assert.equal(res.status, 201, `정지 ${res.body?.code}`);
    const kicked = w.received(victim, 'force_disconnect');
    assert.equal(kicked.length, 1);
    assert.equal(kicked[0].code, 'ACCOUNT_BANNED');
    assert.equal(w.sock(victim).connected, false);
    for (const uuid of others) {
        assert.equal(w.sock(uuid).connected, true, `${uuid} 접속 그대로`);
        assert.equal(w.received(uuid, 'force_disconnect').length, 0, `${uuid} 안 끊김`);
    }
    assert.equal(w.phaseOf(g.gameId), phase, '판 단계 그대로');
    assert.deepEqual(w.aliveOf(g.gameId).filter((u) => others.includes(u)).sort(), [...others].sort(), '다른 5명 살아 있음');
    assert.equal(await db.UserBan.count({ where: { user_id: victim } }), 1);
    assert.equal((await H.myAudits(admin.admin, { action: 'BAN', targetId: victim })).length, 1);
});

test('A14-B-222 7명 판 ㄴ 정지·끊김 → 다시 붙기 거절 → 60초 → 판 전원에게 ㄴ 탈락 알림, 판은 6명으로 계속', async (t) => {
    if (H.noDb(t)) return;
    const { w, g, uuids, tokens, admin } = await gameInDayVote(t, 7);
    const victim = uuids[1];
    const others = uuids.filter((u) => u !== victim);
    const marks = new Map(others.map((u) => [u, w.mark(u)]));
    assert.equal((await banWeek(admin, victim)).status, 201);
    await w.settle();
    assert.equal(w.sock(victim).connected, false);
    // 같은 표로 다시 붙기 → 거절 (이때부터 세션·정지 검사는 진짜 DB)
    sessionCheckRepository.loadSessionCheck.mock.restore();
    const again = await handshake(tokens.get(victim));
    assert.ok(again.err instanceof Error, '다시 붙기가 통과됨');
    await w.tickBy(60_000);
    for (const uuid of others) {
        const got = w.since(uuid, marks.get(uuid), 'player_eliminated').filter((p) => p.victimUuid === victim);
        assert.equal(got.length, 1, `${uuid} 탈락 알림`);
    }
    assert.notEqual(w.phaseOf(g.gameId), 'ENDED');
    assert.deepEqual(w.aliveOf(g.gameId).sort(), [...others].sort(), '판은 6명으로 계속');
});

// 그 사람 탈주 줄
const desertionRows = (uuid) => db.GameDesertion.findAll({ where: { user_id: uuid }, raw: true });

test('A14-B-223 7명 판 ㄴ 정지·끊김 + 정지 아닌 ㄷ도 끊김 → 60초 → 둘 다 판에서 빠짐, 탈주 줄·탈주 대기는 ㄷ만 (ㄴ은 game_desertions 0줄·대기 없음)', async (t) => {
    if (H.noDb(t)) return;
    const { w, g, uuids, admin } = await gameInDayVote(t, 7);
    // 탈주 적기·정지 확인은 진짜 저장소로 (세상 기본은 가짜)
    desertion.__setRepositoryForTests(null);
    const [victim, plain] = [uuids[1], uuids[2]];
    const others = uuids.filter((u) => u !== victim && u !== plain);
    const marks = new Map(others.map((u) => [u, w.mark(u)]));
    assert.equal((await banWeek(admin, victim)).status, 201);
    await w.settle();
    assert.equal(w.sock(victim).connected, false);
    // 견줄 사람: 정지 아닌데 같은 때 끊김
    w.sock(plain).disconnect();
    await w.settle();
    await w.tickBy(60_000);
    for (const uuid of others) {
        const gone = w.since(uuid, marks.get(uuid), 'player_eliminated').map((p) => p.victimUuid);
        assert.deepEqual([...gone].sort(), [victim, plain].sort(), `${uuid}가 받은 탈락 알림`);
    }
    // 탈주 줄 쓰기는 안 기다리는 길 → 견줄 사람 줄이 생길 때까지 기다림 (그때면 ㄴ의 정지 확인도 끝남)
    for (let i = 0; i < 400 && (await desertionRows(plain)).length === 0; i += 1) await w.settle();
    const plainRows = await desertionRows(plain);
    assert.equal(plainRows.length, 1, '정지 아닌 사람 탈주 줄');
    assert.equal(plainRows[0].game_id, g.gameId);
    assert.equal(plainRows[0].reason, 'DISCONNECT_TIMEOUT');
    await w.settle();
    assert.equal((await desertionRows(victim)).length, 0, '정지로 빠진 사람에게 탈주 줄이 생김');
    // 탈주 대기는 방 만들기 답으로 봄: 정지 아닌 사람만 탈주 거절 (정지된 사람은 실제론 못 붙음 → 접속 검사 대역 그대로 두고 탈주 거절이 아닌지만 봄)
    await w.connect(plain);
    assert.equal((await w.createRoom(plain)).code, 'DESERTION_COOLDOWN', '정지 아닌 사람 탈주 대기');
    await w.connect(victim);
    const made = await w.createRoom(victim);
    assert.notEqual(made.code, 'DESERTION_COOLDOWN', '정지로 빠진 사람에게 탈주 대기가 걸림');
    assert.equal(made.ok, true, `방 만들기 거절: ${made.code}`);
});
