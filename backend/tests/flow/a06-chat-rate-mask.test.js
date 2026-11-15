'use strict';

// 채팅 간격(0.5초)·금지어 가리기·판 끝 뒤 거절 흐름 시험 (가짜 소켓·가짜 io·가짜 시계, DB 없음)
// 목록 A06-B-065~078, 돌리기: node --env-file=.env.test --test tests/flow/a06-chat-rate-mask.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (꼭 socket/gameSession보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const chatBuffer = require('../../services/ops/chatBuffer');
const bannedWords = require('../../services/ops/bannedWords');

const T = gs.__testables;
const CHAT_EVENTS = ['day_chat_message_received', 'dead_chat_message_received', 'joker_chat_message'];

// 밤에 죽은 것과 같은 모양으로 만듦 (판 참여는 그대로)
const kill = (session, uuid) => {
    const p = session.players.get(uuid);
    p.alive = false;
    p.deathReason = 'ASSASSINATION';
};

// 판 차리기 + 가짜 시계(채팅 간격이 Date.now를 봄 → Date만 가짜로)
function table(t, { id, n, phase = 'DAY' }) {
    gf.resetCore();
    t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
    const session = gf.startGame({ id, n });
    gf.toDay(session);
    if (phase === 'NIGHT') gf.toNight(session);
    const world = gf.socketWorld(gs, session);
    t.after(() => {
        gf.resetCore();
        chatBuffer.__resetForTests();
        bannedWords.__setWordsForTests([]);
    });
    return { session, world };
}

const say = (world, session, uuid, text) => gf.call(
    T.handleSubmitGameChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text },
);
const sayRole = (world, session, uuid, text) => gf.call(
    T.handleSubmitJokerChatMessage, world.io, world.sock(uuid), uuid, { gameId: session.id, text },
);
const chatCount = (world, uuid) => CHAT_EVENTS.reduce((sum, e) => sum + world.received(uuid, e).length, 0);
const all = (session) => [...session.players.keys()];

// ---- 낮 채팅 0.5초 간격 경계 (A06-B-065~067) ----
const DAY_GAP_CASES = [
    ['A06-B-065', 499, false],
    ['A06-B-066', 500, true],
    ['A06-B-067', 501, true],
];
for (const [no, gap, goes] of DAY_GAP_CASES) {
    test(`${no} 낮 채팅 앞 글 뒤 ${gap / 1000}초 → ${goes ? '감' : 'RATE_LIMITED·받은 사람 0'} (5명)`, async (t) => {
        const { session, world } = table(t, { id: `a06g-${no}`, n: 5 });
        const a = gf.nonJokers(session)[0];
        assert.equal((await say(world, session, a, '첫 글')).ok, true);
        t.mock.timers.tick(gap);
        const reply = await say(world, session, a, '둘째 글');
        if (goes) {
            assert.equal(reply.ok, true);
        } else {
            assert.equal(reply.ok, false);
            assert.equal(reply.code, 'RATE_LIMITED');
        }
        // 둘째 글을 받은 사람 수 = 감이면 전원, 막힘이면 0
        for (const uuid of all(session)) {
            const texts = world.received(uuid, 'day_chat_message_received').map((e) => e.payload.text);
            assert.equal(texts.includes('둘째 글'), goes);
        }
    });
}

test('A06-B-068 거절된 글은 간격을 안 먹음: 151자 거절 직후 0.1초 뒤 정상 글 → 감 (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-068', n: 5 });
    const a = gf.nonJokers(session)[0];
    const long = await say(world, session, a, '가'.repeat(151));
    assert.equal(long.ok, false);
    assert.equal(long.code, 'MESSAGE_TOO_LONG');
    t.mock.timers.tick(100);
    assert.equal((await say(world, session, a, '짧은 글')).ok, true);
    for (const uuid of all(session)) assert.equal(world.received(uuid, 'day_chat_message_received').length, 1);
});

// ---- 밤 같은 직업 채팅 0.5초 간격 경계 (A06-B-069~071) ----
const NIGHT_GAP_CASES = [
    ['A06-B-069', 499, false],
    ['A06-B-070', 500, true],
    ['A06-B-071', 501, true],
];
for (const [no, gap, goes] of NIGHT_GAP_CASES) {
    test(`${no} 밤 의사 채팅 앞 글 뒤 ${gap / 1000}초 → ${goes ? '감' : 'RATE_LIMITED'} (6명)`, async (t) => {
        const { session, world } = table(t, { id: `a06g-${no}`, n: 6, phase: 'NIGHT' });
        const doctor = gf.firstOf(session, 'DOCTOR');
        assert.equal((await sayRole(world, session, doctor, '첫 글')).ok, true);
        t.mock.timers.tick(gap);
        const reply = await sayRole(world, session, doctor, '둘째 글');
        if (goes) {
            assert.equal(reply.ok, true);
        } else {
            assert.equal(reply.ok, false);
            assert.equal(reply.code, 'RATE_LIMITED');
        }
        assert.equal(world.received(doctor, 'joker_chat_message').length, goes ? 2 : 1);
    });
}

test('A06-B-072 죽은 사람이 0.3초 뒤 또 보냄 → RATE_LIMITED (8명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-072', n: 8 });
    const dead = gf.byRole(session, 'CITIZEN')[0];
    kill(session, dead);
    assert.equal((await say(world, session, dead, '첫 글')).ok, true);
    t.mock.timers.tick(300);
    const reply = await say(world, session, dead, '둘째 글');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'RATE_LIMITED');
});

test('A06-B-073 간격은 사람마다 따로: A 보낸 0.1초 뒤 B 보냄 → 둘 다 감 (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-073', n: 5 });
    const [a, b] = gf.nonJokers(session);
    assert.equal((await say(world, session, a, 'A 글')).ok, true);
    t.mock.timers.tick(100);
    assert.equal((await say(world, session, b, 'B 글')).ok, true);
    for (const uuid of all(session)) {
        const texts = world.received(uuid, 'day_chat_message_received').map((e) => e.payload.text);
        assert.deepEqual(texts, ['A 글', 'B 글']);
    }
});

// ---- 금지어 가리기 (A06-B-074~077) ----
test('A06-B-074 낮 채팅 금지어 가림: "너 바보야" → 받은 글 "너 **야", 답 ok (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-074', n: 5 });
    bannedWords.__setWordsForTests(['바보']);
    const a = gf.nonJokers(session)[0];
    assert.equal((await say(world, session, a, '너 바보야')).ok, true);
    for (const uuid of all(session)) {
        assert.equal(world.received(uuid, 'day_chat_message_received')[0].payload.text, '너 **야');
    }
});

test('A06-B-075 밤 같은 직업 채팅도 가림: 의사 "바보" → 받은 글 "**" (6명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-075', n: 6, phase: 'NIGHT' });
    bannedWords.__setWordsForTests(['바보']);
    const doctor = gf.firstOf(session, 'DOCTOR');
    assert.equal((await sayRole(world, session, doctor, '바보')).ok, true);
    assert.equal(world.received(doctor, 'joker_chat_message')[0].payload.text, '**');
});

test('A06-B-076 죽은 사람 채팅도 가림: "바보" → 받은 글 "**" (8명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-076', n: 8 });
    bannedWords.__setWordsForTests(['바보']);
    const [d1, d2] = gf.byRole(session, 'CITIZEN');
    kill(session, d1);
    kill(session, d2);
    assert.equal((await say(world, session, d1, '바보')).ok, true);
    for (const dead of [d1, d2]) {
        assert.equal(world.received(dead, 'dead_chat_message_received')[0].payload.text, '**');
    }
});

test('A06-B-077 금지어 표가 비면 그대로: "바보" → 받은 글 "바보" (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-077', n: 5 });
    bannedWords.__setWordsForTests([]);
    const a = gf.nonJokers(session)[0];
    assert.equal((await say(world, session, a, '바보')).ok, true);
    for (const uuid of all(session)) {
        assert.equal(world.received(uuid, 'day_chat_message_received')[0].payload.text, '바보');
    }
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

test('A06-B-078 판 끝 뒤(결과 화면) 낮 채팅 → GAME_ALREADY_ENDED, 받은 사람 0 (5명)', async (t) => {
    const { session, world } = table(t, { id: 'a06g-078', n: 5 });
    endByExecutingJoker(session);
    const reply = await say(world, session, gf.nonJokers(session)[0], '끝났네');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'GAME_ALREADY_ENDED');
    for (const uuid of all(session)) assert.equal(chatCount(world, uuid), 0);
});
