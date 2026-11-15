'use strict';

// 밤 같은 직업 채팅 흐름 시험: 같은 직업 산 사람만 받는지, 시민·죽은 사람은 못 쓰는지 (가짜 소켓·가짜 io, DB 없음)
// 목록 A06-B-051~064, 돌리기: node --env-file=.env.test --test tests/flow/a06-night-role-chat.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (꼭 socket/gameSession보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const chatBuffer = require('../../services/ops/chatBuffer');

const T = gs.__testables;
const CHAT_EVENTS = ['day_chat_message_received', 'dead_chat_message_received', 'joker_chat_message'];

// 10명 판 직접 구성 광대2·의사2·경비원2·마녀사냥꾼2·시민2
const TEN_CUSTOM = { n: 10, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } };

// 밤에 죽은 것과 같은 모양으로 만듦 (판 참여는 그대로)
const kill = (session, uuid) => {
    const p = session.players.get(uuid);
    p.alive = false;
    p.deathReason = 'ASSASSINATION';
};

// 판 차리기: 직업 고정(randomFn 0) + 원하는 단계 + 가짜 소켓 세상
function table(t, { id, n, phase = 'NIGHT', roleCounts, jokerCount }) {
    gf.resetCore();
    const session = gf.startGame({ id, n, roleCounts, jokerCount });
    gf.toDay(session);
    if (phase === 'TRIBUNAL') gf.toTribunal(session, gf.nonJokers(session)[0]);
    if (phase === 'NIGHT') gf.toNight(session);
    const world = gf.socketWorld(gs, session);
    t.after(() => {
        gf.resetCore();
        chatBuffer.__resetForTests();
    });
    return { session, world };
}

// 밤 같은 직업 채팅 / 낮·죽은 사람 채팅 보내고 답 받기
const sayRole = (world, session, uuid, text) => gf.call(
    T.handleSubmitJokerChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text },
);
const say = (world, session, uuid, text) => gf.call(
    T.handleSubmitGameChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text },
);

const roleChat = (world, uuid) => world.received(uuid, 'joker_chat_message');
const chatCount = (world, uuid) => CHAT_EVENTS.reduce((sum, e) => sum + world.received(uuid, e).length, 0);
const all = (session) => [...session.players.keys()];
const sortIds = (list) => [...list].sort();

// ---- 직업마다 같은 직업 2명만 받음 (A06-B-051~054) ----
const ROLE_CASES = [
    ['A06-B-051', 'JOKER', '광대'],
    ['A06-B-052', 'DOCTOR', '의사'],
    ['A06-B-053', 'GUARD', '경비원'],
    ['A06-B-054', 'WITCH_HUNTER', '마녀사냥꾼'],
];
for (const [no, role, label] of ROLE_CASES) {
    test(`${no} 밤 ${label} 채팅은 ${label} 2명만 받음, 나머지 8명 0 (10명 직접 구성)`, async (t) => {
        const { session, world } = table(t, { id: `a06n-${no}`, ...TEN_CUSTOM });
        const mates = gf.byRole(session, role);
        assert.equal(mates.length, 2);
        const reply = await sayRole(world, session, mates[0], `${label} 회의`);
        assert.equal(reply.ok, true);
        for (const uuid of mates) {
            const got = roleChat(world, uuid);
            assert.equal(got.length, 1, `${uuid}가 같은 직업 글을 못 받음`);
            assert.equal(got[0].payload.text, `${label} 회의`);
            assert.equal(got[0].payload.senderUuid, mates[0]);
        }
        for (const uuid of all(session).filter((u) => !mates.includes(u))) {
            assert.equal(chatCount(world, uuid), 0, `다른 직업 ${uuid}가 ${label} 글을 받음`);
        }
    });
}

test('A06-B-055 밤 산 시민 글은 거절 NOT_ELIGIBLE, 판 7명 받은 것 0 (7명 판 시민 4)', async (t) => {
    const { session, world } = table(t, { id: 'a06n-055', n: 7, jokerCount: 2 });
    const citizens = gf.byRole(session, 'CITIZEN');
    assert.equal(citizens.length, 4);
    const reply = await sayRole(world, session, citizens[0], '시민 있어요?');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_ELIGIBLE');
    for (const uuid of all(session)) assert.equal(chatCount(world, uuid), 0);
});

test('A06-B-056 시민 4명이 차례로 보내도 4번 다 NOT_ELIGIBLE, 시민끼리 받은 것 0', async (t) => {
    const { session, world } = table(t, { id: 'a06n-056', n: 7, jokerCount: 2 });
    const citizens = gf.byRole(session, 'CITIZEN');
    assert.equal(citizens.length, 4);
    for (const c of citizens) {
        const reply = await sayRole(world, session, c, `나 시민 ${c}`);
        assert.equal(reply.ok, false);
        assert.equal(reply.code, 'NOT_ELIGIBLE');
    }
    for (const c of citizens) assert.equal(roleChat(world, c).length, 0);
});

test('A06-B-057 시민은 밤에 어느 직업 채팅도 못 받음 (8명 판: 광대·의사·경비원이 하나씩)', async (t) => {
    const { session, world } = table(t, { id: 'a06n-057', n: 8 });
    for (const role of ['JOKER', 'DOCTOR', 'GUARD']) {
        const speaker = gf.firstOf(session, role);
        assert.ok(speaker, `${role}이 판에 없음`);
        assert.equal((await sayRole(world, session, speaker, `${role} 한마디`)).ok, true);
    }
    const citizens = gf.byRole(session, 'CITIZEN');
    assert.ok(citizens.length > 0);
    for (const c of citizens) assert.equal(roleChat(world, c).length, 0);
});

test('A06-B-058 죽은 광대는 광대 채팅을 못 보냄 → NOT_ELIGIBLE, 받은 사람 0 (7명 판 광대 2)', async (t) => {
    const { session, world } = table(t, { id: 'a06n-058', n: 7, jokerCount: 2 });
    const [, deadJoker] = gf.byRole(session, 'JOKER');
    kill(session, deadJoker);
    const reply = await sayRole(world, session, deadJoker, '죽은 광대');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_ELIGIBLE');
    for (const uuid of all(session)) assert.equal(chatCount(world, uuid), 0);
});

test('A06-B-059 죽은 광대는 광대 채팅을 받음 → 산 광대·죽은 광대 둘 다', async (t) => {
    const { session, world } = table(t, { id: 'a06n-059', n: 7, jokerCount: 2 });
    const [liveJoker, deadJoker] = gf.byRole(session, 'JOKER');
    kill(session, deadJoker);
    assert.equal((await sayRole(world, session, liveJoker, '오늘 누구?')).ok, true);
    for (const j of [liveJoker, deadJoker]) assert.equal(roleChat(world, j).length, 1);
});

test('A06-B-060 죽은 의사는 의사 채팅을 못 받음 (8명 직접 구성 의사 2, 1명 죽음)', async (t) => {
    const { session, world } = table(t, { id: 'a06n-060', n: 8, roleCounts: { JOKER: 1, DOCTOR: 2 } });
    const [liveDoc, deadDoc] = gf.byRole(session, 'DOCTOR');
    kill(session, deadDoc);
    assert.equal((await sayRole(world, session, liveDoc, '누구 살릴까')).ok, true);
    assert.equal(roleChat(world, liveDoc).length, 1);
    assert.equal(roleChat(world, deadDoc).length, 0);
});

test('A06-B-061 죽은 광대가 밤에 낮 채팅 길로 쓰면 죽은 사람 채널 → 죽은 사람만, 산 광대 0', async (t) => {
    const { session, world } = table(t, { id: 'a06n-061', n: 7, jokerCount: 2 });
    const [liveJoker, deadJoker] = gf.byRole(session, 'JOKER');
    const deadCitizen = gf.byRole(session, 'CITIZEN')[0];
    kill(session, deadJoker);
    kill(session, deadCitizen);
    assert.equal((await say(world, session, deadJoker, '죽은 광대 말')).ok, true);
    for (const dead of [deadJoker, deadCitizen]) assert.equal(world.received(dead, 'dead_chat_message_received').length, 1);
    assert.equal(chatCount(world, liveJoker), 0);
    assert.deepEqual(
        sortIds(all(session).filter((u) => chatCount(world, u) > 0)),
        sortIds([deadJoker, deadCitizen]),
    );
});

test('A06-B-062 낮에 의사 같은 직업 채팅 → INVALID_PHASE (6명)', async (t) => {
    const { session, world } = table(t, { id: 'a06n-062', n: 6, phase: 'DAY' });
    const reply = await sayRole(world, session, gf.firstOf(session, 'DOCTOR'), '낮에 의사끼리');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'INVALID_PHASE');
});

test('A06-B-063 재판 중 광대 같은 직업 채팅 → INVALID_PHASE (6명)', async (t) => {
    const { session, world } = table(t, { id: 'a06n-063', n: 6, phase: 'TRIBUNAL' });
    assert.equal(session.phase, 'TRIBUNAL');
    const reply = await sayRole(world, session, gf.firstOf(session, 'JOKER'), '재판 중 광대끼리');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'INVALID_PHASE');
});

test('A06-B-064 같은 직업이 혼자면 자기만 받음 (5명 판 광대 1) → ok', async (t) => {
    const { session, world } = table(t, { id: 'a06n-064', n: 5 });
    const joker = gf.firstOf(session, 'JOKER');
    assert.equal((await sayRole(world, session, joker, '혼잣말')).ok, true);
    assert.equal(roleChat(world, joker).length, 1);
    for (const uuid of all(session).filter((u) => u !== joker)) assert.equal(chatCount(world, uuid), 0);
});
