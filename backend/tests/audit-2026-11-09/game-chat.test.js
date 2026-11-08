'use strict';

// 게임 진행 시험: 낮 채팅 글 검사·채널·prepare/commit 바꿔치기 막기·간격 (2차 묶음)
// 시계는 now 함수로 주입 (시간에 안 흔들림)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core, T } = F;

test.beforeEach(() => F.resetCore());
test.afterEach(() => F.resetCore());

let seq = 0;
const dayGame = () => {
    seq += 1;
    const session = F.toDay(F.startGame({ id: `chat${seq}`, n: 5 }));
    return { session, uuids: [...session.players.keys()] };
};
const at = (t, extra = {}) => ({ now: () => t, ...extra });
const prepare = (session, uuid, text, t = 10_000, extra = {}) => core.prepareGameChatMessage(uuid, session.id, text, at(t, extra));

// ── 글 검사 ──

test('글 검사: 150자는 통과, 151자는 MESSAGE_TOO_LONG', () => {
    assert.equal(T.sanitizeChatText('가'.repeat(150)).ok, true);
    assert.equal(T.sanitizeChatText('가'.repeat(151)).code, 'MESSAGE_TOO_LONG');
});

test('글 검사: 앞뒤 공백 잘라 151자가 150자 이하가 되면 통과', () => {
    assert.equal(T.sanitizeChatText(` ${'a'.repeat(149)} `).text.length, 149);
});

test('글 검사: 탭은 막힌 문자, 공백·줄바꿈뿐이면 EMPTY_MESSAGE', () => {
    assert.equal(T.sanitizeChatText(' \n\t ').code, 'INVALID_CHARACTERS');
    assert.equal(T.sanitizeChatText('   \n  ').code, 'EMPTY_MESSAGE');
});

test('글 검사: 안 보이는 제어 문자·글 방향 바꾸는 문자는 INVALID_CHARACTERS', () => {
    for (const bad of ['a\u0000b', 'a‮b', 'a‏b', 'a⁦b', 'a\u007fb']) {
        assert.equal(T.sanitizeChatText(bad).code, 'INVALID_CHARACTERS');
    }
});

test('글 검사: \\r\\n·\\r은 \\n 하나로 맞춤', () => {
    assert.equal(T.sanitizeChatText('a\r\nb\rc').text, 'a\nb\nc');
});

test('글 검사: 문자열 아닌 값은 INVALID_CHARACTERS', () => {
    assert.equal(T.sanitizeChatText(42).code, 'INVALID_CHARACTERS');
    assert.equal(T.sanitizeChatText(null).code, 'INVALID_CHARACTERS');
});

// ── 채널·자격 ──

test('낮 채팅: 산 사람은 낮·재판 때 보낼 수 있고 밤엔 INVALID_PHASE', () => {
    const { session, uuids } = dayGame();
    assert.equal(prepare(session, uuids[0], '안녕').channel, 'DAY');
    session.phase = 'TRIBUNAL';
    assert.equal(prepare(session, uuids[0], '안녕').ok, true);
    session.phase = 'NIGHT';
    assert.equal(prepare(session, uuids[0], '안녕').code, 'INVALID_PHASE');
});

test('낮 채팅: 죽은 사람은 NOT_ELIGIBLE (읽기만)', () => {
    const { session, uuids } = dayGame();
    session.players.get(uuids[0]).alive = false;
    assert.equal(prepare(session, uuids[0], '나 죽었어').code, 'NOT_ELIGIBLE');
    assert.ok(core.getChatRecipientUuids(session, 'DAY').includes(uuids[0]));
});

test('낮 채팅: 끝난 판이면 GAME_ALREADY_ENDED', () => {
    const { session, uuids } = dayGame();
    session.phase = 'ENDED';
    assert.equal(prepare(session, uuids[0], 'gg').code, 'GAME_ALREADY_ENDED');
});

test('낮 채팅: 시계 값이 음수·소수면 INVALID_CLOCK_VALUE', () => {
    const { session, uuids } = dayGame();
    assert.equal(prepare(session, uuids[0], 'a', -1).code, 'INVALID_CLOCK_VALUE');
    assert.equal(prepare(session, uuids[0], 'a', 1.5).code, 'INVALID_CLOCK_VALUE');
});

test('낮 채팅: 메시지 id 함수가 터지면 ID_GENERATION_ERROR, 빈 id면 INVALID_MESSAGE_ID', () => {
    const { session, uuids } = dayGame();
    assert.equal(prepare(session, uuids[0], 'a', 1, { idFn: () => { throw new Error('x'); } }).code, 'ID_GENERATION_ERROR');
    assert.equal(prepare(session, uuids[0], 'a', 1, { idFn: () => '  ' }).code, 'INVALID_MESSAGE_ID');
});

// ── commit ──

test('commit: prepare 그대로 5초 안이면 기록되고 메시지 돌려줌', () => {
    const { session, uuids } = dayGame();
    const p = prepare(session, uuids[0], '안녕', 10_000, { idFn: () => 'm-1' });
    const c = core.commitGameChatMessage(p, at(14_000));
    assert.deepEqual([c.ok, c.message.messageId, c.message.text], [true, 'm-1', '안녕']);
});

test('commit: prepare 뒤 5초 넘으면 STALE_CHAT_TIMESTAMP, 미래 시각이어도 거절', () => {
    const { session, uuids } = dayGame();
    const p = prepare(session, uuids[0], 'a', 10_000);
    assert.equal(core.commitGameChatMessage(p, at(15_001)).code, 'STALE_CHAT_TIMESTAMP');
    const q = prepare(session, uuids[1], 'a', 10_000);
    assert.equal(core.commitGameChatMessage(q, at(9_999)).code, 'STALE_CHAT_TIMESTAMP');
});

test('commit을 같은 prepare로 두 번 하면 두 번째는 STALE_CHAT_REQUEST', () => {
    const { session, uuids } = dayGame();
    const p = prepare(session, uuids[0], 'a', 10_000);
    core.commitGameChatMessage(p, at(10_000));
    assert.equal(core.commitGameChatMessage(p, at(10_000)).code, 'STALE_CHAT_REQUEST');
});

test('commit: prepare 결과의 글을 몰래 바꾸면 STALE_CHAT_REQUEST, 간격 기록 안 먹음', () => {
    const { session, uuids } = dayGame();
    const p = prepare(session, uuids[0], '원래 글', 10_000);
    p.message.text = '바꾼 글';
    assert.equal(core.commitGameChatMessage(p, at(10_000)).code, 'STALE_CHAT_REQUEST');
    assert.equal(session.dayChatRateLimit.has(uuids[0]), false);
});

test('commit: 손으로 만든 비슷한 객체는 STALE_CHAT_REQUEST', () => {
    const { session, uuids } = dayGame();
    const p = prepare(session, uuids[0], 'a', 10_000);
    assert.equal(core.commitGameChatMessage({ ...p, message: { ...p.message } }, at(10_000)).code, 'STALE_CHAT_REQUEST');
    assert.equal(core.commitGameChatMessage(null).code, 'STALE_CHAT_REQUEST');
});

test('commit: 그사이 죽었으면 NOT_ELIGIBLE, 그사이 밤이 됐으면 INVALID_PHASE', () => {
    const a = dayGame();
    const p = prepare(a.session, a.uuids[0], 'a', 10_000);
    a.session.players.get(a.uuids[0]).alive = false;
    assert.equal(core.commitGameChatMessage(p, at(10_000)).code, 'NOT_ELIGIBLE');
    const q = prepare(a.session, a.uuids[1], 'a', 10_000);
    a.session.phase = 'NIGHT';
    assert.equal(core.commitGameChatMessage(q, at(10_000)).code, 'INVALID_PHASE');
});

test('commit: 그사이 날짜가 넘어갔으면 STALE_CHAT_REQUEST', () => {
    const { session, uuids } = dayGame();
    const p = prepare(session, uuids[0], 'a', 10_000);
    session.dayIndex += 1;
    assert.equal(core.commitGameChatMessage(p, at(10_000)).code, 'STALE_CHAT_REQUEST');
});

test('commit: 그사이 판을 나갔으면 NOT_IN_SESSION', () => {
    const { session, uuids } = dayGame();
    const citizen = F.byRole(session, 'CITIZEN')[0];
    const p = prepare(session, citizen, 'a', 10_000);
    core.commitParticipantDeparture(session, citizen);
    assert.equal(core.commitGameChatMessage(p, at(10_000)).code, 'NOT_IN_SESSION');
    assert.ok(uuids.includes(citizen));
});

test('간격: 기록 뒤 0.5초 안 prepare는 RATE_LIMITED, 실패한 prepare는 간격 안 먹음', () => {
    const { session, uuids } = dayGame();
    core.commitGameChatMessage(prepare(session, uuids[0], 'a', 10_000), at(10_000));
    assert.equal(prepare(session, uuids[0], 'b', 10_400).code, 'RATE_LIMITED');
    assert.equal(prepare(session, uuids[0], 'b', 10_500).ok, true);
});

test('간격: 두 prepare를 거의 같이 받아도 commit은 한 개만 통과 (두 번째는 STALE_CHAT_TIMESTAMP)', () => {
    const { session, uuids } = dayGame();
    const p1 = prepare(session, uuids[0], 'a', 10_000);
    const p2 = prepare(session, uuids[0], 'b', 10_100);
    assert.equal(core.commitGameChatMessage(p1, at(10_200)).ok, true);
    assert.equal(core.commitGameChatMessage(p2, at(10_200)).code, 'STALE_CHAT_TIMESTAMP');
});
