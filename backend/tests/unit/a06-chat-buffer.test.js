'use strict';

// 판 채팅 메모리 보관 순수 시험: 판 500줄·300판 상한, 판 끝 뒤 10분, 끝 표시 없이 3시간
// 목록 A06-B-036~040, 돌리기: node --env-file=.env.test --test tests/unit/a06-chat-buffer.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const chatBuffer = require('../../services/ops/chatBuffer');

// 가짜 시계 값 (보관 함수가 now를 받음)
const T0 = Date.UTC(2026, 10, 16, 3, 0, 0);
const at = (ms) => ({ now: () => T0 + ms });
const MIN = 60_000;
const HOUR = 60 * MIN;

// 한 줄 넣기 (낮 채팅 모양)
const put = (gameId, text, ms = 0) => chatBuffer.recordGameChatMessage(
    gameId,
    { channel: 'DAY', senderUuid: 'u-1', nickname: '닉1', text, sentAt: T0 + ms },
    at(ms),
);

// 시험마다 보관함 비움 (판끼리 안 섞이게)
test.beforeEach(() => chatBuffer.__resetForTests());
test.after(() => chatBuffer.__resetForTests());

test('A06-B-036 판 하나 501줄 넣으면 꺼낸 줄 500, 첫 줄 없음', () => {
    for (let i = 1; i <= 501; i += 1) put('g-500', `글${i}`);
    const lines = chatBuffer.getGameChatMessages('g-500', at(0));
    assert.equal(lines.length, 500);
    assert.equal(lines.some((m) => m.text === '글1'), false);
    assert.equal(lines[0].text, '글2');
    assert.equal(lines[499].text, '글501');
});

test('A06-B-037 판 300개 상한: 끝난 판 1개 + 진행 판 300개 → 끝난 판 줄 0, 진행 판 다 남음', () => {
    put('g-ended', '끝난 판 글');
    chatBuffer.markGameEnded('g-ended', at(0));
    for (let i = 0; i < 300; i += 1) put(`g-live-${i}`, `진행 ${i}`);
    assert.deepEqual(chatBuffer.getGameChatMessages('g-ended', at(0)), []);
    for (let i = 0; i < 300; i += 1) {
        assert.equal(chatBuffer.getGameChatMessages(`g-live-${i}`, at(0)).length, 1, `진행 판 ${i} 줄 없어짐`);
    }
});

// 판 끝 표시 뒤 10분 경계
const END_CASES = [
    ['A06-B-038', 9 * MIN + 59_000, 1, '9분 59초 → 줄 남음'],
    ['A06-B-039', 10 * MIN, 0, '10분 → 빈 목록'],
];
for (const [no, after, count, label] of END_CASES) {
    test(`${no} 판 끝 뒤 ${label}`, () => {
        put('g-end', '결과 화면 신고용 글');
        chatBuffer.markGameEnded('g-end', at(0));
        assert.equal(chatBuffer.getGameChatMessages('g-end', at(after)).length, count);
    });
}

test('A06-B-040 끝 표시 없는 판: 마지막 채팅 뒤 2시간 59분 59초 남음 → 3시간 빈 목록', () => {
    put('g-quiet', '첫 글', 0);
    put('g-quiet', '마지막 글', 30 * MIN);
    const last = 30 * MIN;
    assert.equal(chatBuffer.getGameChatMessages('g-quiet', at(last + 3 * HOUR - 1_000)).length, 2);
    assert.deepEqual(chatBuffer.getGameChatMessages('g-quiet', at(last + 3 * HOUR)), []);
});
