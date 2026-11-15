'use strict';

// 판 안 이모티콘 흐름 시험: 단계마다 판 전원 말풍선, 죽은 사람·안 가진 것·팔레트 밖·1초 간격·끝난 판·남의 판 거절
// 목록 A06-B-079~090, 돌리기: node --env-file=.env.test --test tests/flow/a06-emoji.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (꼭 socket/gameSession보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const chatBuffer = require('../../services/ops/chatBuffer');

const T = gs.__testables;

// 가진 것 3개 중 팔레트엔 2개만 (emo-out은 가졌지만 팔레트 밖)
const OWNED = ['emo-smile', 'emo-cry', 'emo-out'];
const SLOTS = ['emo-smile', 'emo-cry', null];

// 밤에 죽은 것과 같은 모양으로 만듦 (판 참여는 그대로)
const kill = (session, uuid) => {
    const p = session.players.get(uuid);
    p.alive = false;
    p.deathReason = 'ASSASSINATION';
};

// 판 시작 때 DB에서 읽어 붙이는 이모티콘 팔레트를 같은 모양으로 붙임 (판 시작 commitLaunch와 같음)
const attachPalettes = (session) => {
    session.emojiPaletteByUuid = new Map(
        [...session.players.keys()].map((uuid) => [uuid, { slots: [...SLOTS], owned: [...OWNED] }]),
    );
    session.emojiRateLimit = new Map();
};

// 단계로 옮긴 판 하나 (가짜 소켓 세상은 따로 만듦: 판 둘 시험 때문)
function openGame({ id, n, phase }) {
    const session = gf.startGame({ id, n });
    attachPalettes(session);
    if (phase !== 'ROLE_REVEAL') gf.toDay(session);
    if (phase === 'TRIBUNAL') gf.toTribunal(session, gf.nonJokers(session)[0]);
    if (phase === 'NIGHT') gf.toNight(session);
    return session;
}

// 판 차리기 + 가짜 시계(이모티콘 간격이 Date.now를 봄 → Date만 가짜로)
function table(t, { id, n, phase = 'DAY' }) {
    gf.resetCore();
    t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
    const session = openGame({ id, n, phase });
    const world = gf.socketWorld(gs, session);
    t.after(() => {
        gf.resetCore();
        chatBuffer.__resetForTests();
    });
    return { session, world };
}

const emoji = (world, gameId, uuid, itemId) => gf.call(
    T.handleSendEmoji, world.io, world.sock(uuid), uuid, { gameId, itemId },
);
const shown = (world, uuid) => world.received(uuid, 'emoji_shown');
const all = (session) => [...session.players.keys()];

// 전원이 말풍선 하나씩 (보낸 사람·이모티콘 id까지)
function assertEveryoneSaw(world, session, sender, itemId, count = 1) {
    for (const uuid of all(session)) {
        const got = shown(world, uuid);
        assert.equal(got.length, count, `${uuid}가 말풍선을 ${got.length}번 받음`);
        assert.equal(got[count - 1].payload.uuid, sender);
        assert.equal(got[count - 1].payload.itemId, itemId);
    }
}
function assertNobodySaw(world, session) {
    for (const uuid of all(session)) assert.equal(shown(world, uuid).length, 0);
}

test('A06-B-079 역할 확인 중 이모티콘 됨 → 답 ok, 6명 모두 말풍선', async (t) => {
    const { session, world } = table(t, { id: 'a06e-079', n: 6, phase: 'ROLE_REVEAL' });
    assert.equal(session.phase, 'ROLE_REVEAL');
    const a = gf.nonJokers(session)[0];
    assert.equal((await emoji(world, session.id, a, 'emo-smile')).ok, true);
    assertEveryoneSaw(world, session, a, 'emo-smile');
});

test('A06-B-080 낮 이모티콘 판 전원 5명 (uuid·itemId)', async (t) => {
    const { session, world } = table(t, { id: 'a06e-080', n: 5 });
    const a = gf.nonJokers(session)[1];
    assert.equal((await emoji(world, session.id, a, 'emo-cry')).ok, true);
    assertEveryoneSaw(world, session, a, 'emo-cry');
});

test('A06-B-081 재판 중 이모티콘 7명 모두 받음', async (t) => {
    const { session, world } = table(t, { id: 'a06e-081', n: 7, phase: 'TRIBUNAL' });
    assert.equal(session.phase, 'TRIBUNAL');
    const a = gf.nonJokers(session)[2];
    assert.equal((await emoji(world, session.id, a, 'emo-smile')).ok, true);
    assertEveryoneSaw(world, session, a, 'emo-smile');
});

test('A06-B-082 밤에 산 시민 이모티콘 7명 모두 받음', async (t) => {
    const { session, world } = table(t, { id: 'a06e-082', n: 7, phase: 'NIGHT' });
    const citizen = gf.firstOf(session, 'CITIZEN');
    assert.equal((await emoji(world, session.id, citizen, 'emo-smile')).ok, true);
    assertEveryoneSaw(world, session, citizen, 'emo-smile');
});

test('A06-B-083 죽은 사람 이모티콘 거절 → PLAYER_NOT_ALIVE, 받은 사람 0 (8명)', async (t) => {
    const { session, world } = table(t, { id: 'a06e-083', n: 8 });
    const dead = gf.firstOf(session, 'CITIZEN');
    kill(session, dead);
    const reply = await emoji(world, session.id, dead, 'emo-smile');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'PLAYER_NOT_ALIVE');
    assertNobodySaw(world, session);
});

// ---- 1초 간격 경계 (A06-B-084~086) ----
const GAP_CASES = [
    ['A06-B-084', 999, false],
    ['A06-B-085', 1000, true],
    ['A06-B-086', 1001, true],
];
for (const [no, gap, goes] of GAP_CASES) {
    test(`${no} 이모티콘 앞 것 뒤 ${gap / 1000}초 → ${goes ? '감' : 'RATE_LIMITED·받은 사람 0'} (6명)`, async (t) => {
        const { session, world } = table(t, { id: `a06e-${no}`, n: 6 });
        const a = gf.nonJokers(session)[0];
        assert.equal((await emoji(world, session.id, a, 'emo-smile')).ok, true);
        t.mock.timers.tick(gap);
        const reply = await emoji(world, session.id, a, 'emo-cry');
        if (goes) {
            assert.equal(reply.ok, true);
            assertEveryoneSaw(world, session, a, 'emo-cry', 2);
        } else {
            assert.equal(reply.ok, false);
            assert.equal(reply.code, 'RATE_LIMITED');
            // 둘째 것은 아무도 못 받음 (첫 것만 1개)
            for (const uuid of all(session)) assert.deepEqual(shown(world, uuid).map((e) => e.payload.itemId), ['emo-smile']);
        }
    });
}

test('A06-B-087 안 가진 이모티콘 거절 → NOT_OWNED, 받은 사람 0 (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06e-087', n: 5 });
    const reply = await emoji(world, session.id, gf.nonJokers(session)[0], 'emo-not-mine');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_OWNED');
    assertNobodySaw(world, session);
});

test('A06-B-088 가졌지만 팔레트 밖 이모티콘 거절 → NOT_IN_PALETTE (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06e-088', n: 5 });
    const reply = await emoji(world, session.id, gf.nonJokers(session)[0], 'emo-out');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_IN_PALETTE');
    assertNobodySaw(world, session);
});

// 광대를 재판에 세워 모두 유죄 → 시민 승으로 판 끝 (결과 화면 상태)
function endByExecutingJoker(session) {
    const joker = gf.firstOf(session, 'JOKER');
    gf.toTribunal(session, joker);
    for (const uuid of gf.nonJokers(session)) {
        const r = gf.core.submitTribunalVote(uuid, session.id, session.dayIndex, 'GUILTY');
        assert.equal(r.ok, true, `재판 표 실패: ${r.code}`);
    }
    const prepared = gf.core.prepareTribunalVoteResolution(gf.nonJokers(session)[0], session.id, session.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    gf.core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(session.phase, 'ENDED');
}

test('A06-B-089 판 끝 뒤(결과 화면) 이모티콘 거절 → GAME_ENDED (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06e-089', n: 5 });
    endByExecutingJoker(session);
    const reply = await emoji(world, session.id, gf.nonJokers(session)[0], 'emo-smile');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'GAME_ENDED');
    assertNobodySaw(world, session);
});

test('A06-B-090 남의 판 id로 낮 채팅·이모티콘 못 보냄 → 거절, 판 2 사람 받은 것 0 (5명·6명 판)', async (t) => {
    gf.resetCore();
    t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
    const g1 = openGame({ id: 'a06e-090a', n: 5, phase: 'DAY' });
    const g2 = openGame({ id: 'a06e-090b', n: 6, phase: 'DAY' });
    const w1 = gf.socketWorld(gs, g1);
    const w2 = gf.socketWorld(gs, g2);
    // 두 판 사람 모두 지금 소켓으로 등록 (socketWorld는 부를 때마다 등록 목록을 갈아 끼움)
    gs.setOnlineUsersRegistry(new Map([...w1.registry, ...w2.registry]));
    t.after(() => {
        gf.resetCore();
        chatBuffer.__resetForTests();
    });
    const intruder = gf.nonJokers(g1)[0];
    const chat = await gf.call(
        T.handleSubmitGameChatMessage, w1.io, w1.sock(intruder), intruder, { gameId: g2.id, text: '남의 판에 말함' },
    );
    assert.equal(chat.ok, false);
    const emo = await emoji(w1, g2.id, intruder, 'emo-smile');
    assert.equal(emo.ok, false);
    for (const uuid of all(g2)) {
        assert.equal(w2.received(uuid, 'day_chat_message_received').length, 0);
        assert.equal(shown(w2, uuid).length, 0);
    }
});
