'use strict';

// 낮·재판·죽은 사람 채팅 흐름 시험: 보낸 사람 답과 판 사람마다 받은 알림을 봄 (가짜 소켓·가짜 io, DB 없음)
// 목록 A06-B-041~050, 돌리기: node --env-file=.env.test --test tests/flow/a06-day-dead-chat.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (꼭 socket/gameSession보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const chatBuffer = require('../../services/ops/chatBuffer');

const T = gs.__testables;
const CHAT_EVENTS = ['day_chat_message_received', 'dead_chat_message_received', 'joker_chat_message'];

// 밤에 죽은 것과 같은 모양으로 만듦 (판 참여는 그대로)
const kill = (session, uuid) => {
    const p = session.players.get(uuid);
    p.alive = false;
    p.deathReason = 'ASSASSINATION';
};

// 판 차리기: 직업 고정(randomFn 0) + 원하는 단계 + 가짜 소켓 세상
function table(t, { id, n, phase = 'DAY', defendant = null, roleCounts, jokerCount }) {
    gf.resetCore();
    const session = gf.startGame({ id, n, roleCounts, jokerCount });
    if (phase !== 'ROLE_REVEAL') gf.toDay(session);
    if (phase === 'DAY_VOTE') gf.toVote(session);
    if (phase === 'TRIBUNAL') gf.toTribunal(session, defendant ?? gf.nonJokers(session)[0]);
    if (phase === 'NIGHT') gf.toNight(session);
    const world = gf.socketWorld(gs, session);
    t.after(() => {
        gf.resetCore();
        chatBuffer.__resetForTests();
    });
    return { session, world };
}

// 화면이 보내는 것처럼 낮·죽은 사람 채팅 하나 보내고 답 받기
const say = (world, session, uuid, text) => gf.call(
    T.handleSubmitGameChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text },
);
const sayRole = (world, session, uuid, text) => gf.call(
    T.handleSubmitJokerChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text },
);

// 한 사람이 받은 채팅 알림 수 (세 채팅 이벤트 합)
const chatCount = (world, uuid) => CHAT_EVENTS.reduce((sum, e) => sum + world.received(uuid, e).length, 0);
const all = (session) => [...session.players.keys()];

// 전원이 낮 채팅 한 줄씩 받았는지 (글·보낸 사람까지)
function assertEveryoneGotDay(world, session, sender, text) {
    for (const uuid of all(session)) {
        const got = world.received(uuid, 'day_chat_message_received');
        assert.equal(got.length, 1, `${uuid}가 낮 채팅을 ${got.length}번 받음`);
        assert.equal(got[0].payload.text, text);
        assert.equal(got[0].payload.senderUuid, sender);
    }
}

test('A06-B-041 낮 토론 채팅은 판 전원(5명)이 받음', async (t) => {
    const { session, world } = table(t, { id: 'a06d-041', n: 5 });
    const a = gf.nonJokers(session)[0];
    const reply = await say(world, session, a, '안녕');
    assert.equal(reply.ok, true);
    assertEveryoneGotDay(world, session, a, '안녕');
});

test('A06-B-042 낮 투표 단계에도 낮 채팅 됨 (6명 전원 받음)', async (t) => {
    const { session, world } = table(t, { id: 'a06d-042', n: 6, phase: 'DAY_VOTE' });
    const a = gf.nonJokers(session)[1];
    assert.equal((await say(world, session, a, '투표 중 한마디')).ok, true);
    assertEveryoneGotDay(world, session, a, '투표 중 한마디');
});

test('A06-B-043 재판 중 피고도 말함 (6명 전원 받음)', async (t) => {
    const { session, world } = table(t, { id: 'a06d-043', n: 6, phase: 'TRIBUNAL' });
    const defendant = gf.nonJokers(session)[0];
    assert.equal(session.phase, 'TRIBUNAL');
    assert.equal((await say(world, session, defendant, '저 아니에요')).ok, true);
    assertEveryoneGotDay(world, session, defendant, '저 아니에요');
});

test('A06-B-044 재판 중 피고 아닌 산 사람도 말함 (7명 전원 받음)', async (t) => {
    const { session, world } = table(t, { id: 'a06d-044', n: 7, phase: 'TRIBUNAL' });
    const juror = gf.nonJokers(session)[2];
    assert.equal((await say(world, session, juror, '유죄 같아요')).ok, true);
    assertEveryoneGotDay(world, session, juror, '유죄 같아요');
});

test('A06-B-045 재판 중 죽은 사람 글은 죽은 2명만 받음, 산 5명 0', async (t) => {
    const { session, world } = table(t, { id: 'a06d-045', n: 7, phase: 'TRIBUNAL' });
    const [, d1, d2] = gf.nonJokers(session);
    kill(session, d1);
    kill(session, d2);
    assert.equal((await say(world, session, d1, '죽은 사람 말')).ok, true);
    for (const dead of [d1, d2]) {
        const got = world.received(dead, 'dead_chat_message_received');
        assert.equal(got.length, 1);
        assert.equal(got[0].payload.text, '죽은 사람 말');
    }
    for (const uuid of all(session).filter((u) => u !== d1 && u !== d2)) {
        assert.equal(chatCount(world, uuid), 0, `산 사람 ${uuid}가 죽은 사람 글을 받음`);
    }
});

test('A06-B-046 낮 죽은 사람 글은 산 사람이 못 봄 (8명 판, 죽은 2명) — 낮 채팅 알림도 안 감', async (t) => {
    const { session, world } = table(t, { id: 'a06d-046', n: 8 });
    const [d1, d2] = gf.nonJokers(session);
    kill(session, d1);
    kill(session, d2);
    assert.equal((await say(world, session, d2, '나 죽었어')).ok, true);
    for (const dead of [d1, d2]) assert.equal(world.received(dead, 'dead_chat_message_received').length, 1);
    for (const uuid of all(session)) assert.equal(world.received(uuid, 'day_chat_message_received').length, 0);
    for (const uuid of all(session).filter((u) => u !== d1 && u !== d2)) assert.equal(chatCount(world, uuid), 0);
});

test('A06-B-047 죽은 시민도 밤에 죽은 사람 채팅 (8명 판) → ok, 죽은 사람만 받음', async (t) => {
    const { session, world } = table(t, { id: 'a06d-047', n: 8, phase: 'NIGHT' });
    const citizen = gf.byRole(session, 'CITIZEN')[0];
    const otherDead = gf.byRole(session, 'CITIZEN')[1];
    kill(session, citizen);
    kill(session, otherDead);
    const reply = await say(world, session, citizen, '밤에도 말함');
    assert.equal(reply.ok, true);
    for (const dead of [citizen, otherDead]) assert.equal(world.received(dead, 'dead_chat_message_received').length, 1);
    for (const uuid of all(session).filter((u) => u !== citizen && u !== otherDead)) assert.equal(chatCount(world, uuid), 0);
});

test('A06-B-048 산 의사가 밤에 낮 채팅 → INVALID_PHASE, 판 누구도 못 받음 (6명)', async (t) => {
    const { session, world } = table(t, { id: 'a06d-048', n: 6, phase: 'NIGHT' });
    const doctor = gf.firstOf(session, 'DOCTOR');
    const reply = await say(world, session, doctor, '밤인데 낮 채팅');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'INVALID_PHASE');
    for (const uuid of all(session)) assert.equal(chatCount(world, uuid), 0);
});

test('A06-B-049 역할 확인 중 낮 채팅 막힘 → INVALID_PHASE, 받은 사람 0 (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06d-049', n: 5, phase: 'ROLE_REVEAL' });
    assert.equal(session.phase, 'ROLE_REVEAL');
    const reply = await say(world, session, gf.nonJokers(session)[0], '벌써?');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'INVALID_PHASE');
    for (const uuid of all(session)) assert.equal(chatCount(world, uuid), 0);
});

test('A06-B-050 역할 확인 중 광대 같은 직업 채팅도 막힘 → INVALID_PHASE, 받은 사람 0 (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06d-050', n: 5, phase: 'ROLE_REVEAL' });
    const reply = await sayRole(world, session, gf.firstOf(session, 'JOKER'), '광대 여기');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'INVALID_PHASE');
    for (const uuid of all(session)) assert.equal(chatCount(world, uuid), 0);
});
