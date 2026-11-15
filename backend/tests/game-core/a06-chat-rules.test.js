'use strict';

// 판 중 채팅 규칙 순수 시험: 밤 채팅 여는 직업·글 검사·채널 정하기·채널마다 받는 사람
// 목록 A06-B-001~035 (docs/게임_의도_2026-11-15/시험목록/A06-판중-채팅.md), 돌리기: node --test tests/game-core/a06-chat-rules.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (꼭 game-core보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const core = require('../../game-core/gameSession');
// 채팅 규칙 함수는 chat/rules에서 바로 (판 장부 묶음엔 일부만 나옴)
const rules = require('../../game-core/chat/rules');

// 밤에 죽은 것과 같은 모양으로 만듦 (판 참여는 그대로)
const kill = (session, uuid) => {
    const p = session.players.get(uuid);
    p.alive = false;
    p.deathReason = 'ASSASSINATION';
};

// 시험마다 판 장부 비우고 판 id 다르게 (같은 uuid 겹침 막기)
const fresh = (t, opts) => {
    gf.resetCore();
    t.after(() => gf.resetCore());
    return gf.startGame(opts);
};

const sortIds = (list) => [...list].sort();

// 10명 판 직접 구성 광대2·의사2·경비원2·마녀사냥꾼2·시민2
const TEN_CUSTOM = { n: 10, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } };

// ---- 밤 같은 직업 채팅을 여는 직업 (A06-B-001~005) ----
const NIGHT_ROLE_CASES = [
    ['A06-B-001', 'JOKER', true],
    ['A06-B-002', 'DOCTOR', true],
    ['A06-B-003', 'GUARD', true],
    ['A06-B-004', 'WITCH_HUNTER', true],
    ['A06-B-005', 'CITIZEN', false],
];
for (const [no, role, open] of NIGHT_ROLE_CASES) {
    test(`${no} 밤 같은 직업 채팅: ${role} → ${open ? '열림' : '닫힘'}`, () => {
        assert.equal(rules.isNightChatRole(role), open);
    });
}

// ---- 글 검사 (A06-B-006~019) ----
test('A06-B-006 빈 글 거절 → EMPTY_MESSAGE', () => {
    assert.deepEqual(rules.sanitizeChatText(''), { ok: false, code: 'EMPTY_MESSAGE' });
});

test('A06-B-007 공백·줄바꿈만 있는 글 거절 → EMPTY_MESSAGE', () => {
    assert.deepEqual(rules.sanitizeChatText('   \n '), { ok: false, code: 'EMPTY_MESSAGE' });
});

// 150자 경계: 앞뒤 공백은 빼고 셈 → 통과면 공백 뺀 글
const LENGTH_CASES = [
    ['A06-B-008', 1, true],
    ['A06-B-009', 149, true],
    ['A06-B-010', 150, true],
    ['A06-B-011', 151, false],
];
for (const [no, len, pass] of LENGTH_CASES) {
    test(`${no} 글 길이 ${len}자 → ${pass ? '통과' : 'MESSAGE_TOO_LONG'}`, () => {
        const body = 'a'.repeat(len);
        const r = rules.sanitizeChatText(`  ${body}  `);
        if (pass) assert.deepEqual(r, { ok: true, text: body });
        else assert.deepEqual(r, { ok: false, code: 'MESSAGE_TOO_LONG' });
    });
}

const HANGUL_CASES = [
    ['A06-B-012', 150, true],
    ['A06-B-013', 151, false],
];
for (const [no, len, pass] of HANGUL_CASES) {
    test(`${no} 한글 ${len}자 → ${pass ? '통과' : 'MESSAGE_TOO_LONG'}`, () => {
        const body = '가'.repeat(len);
        const r = rules.sanitizeChatText(body);
        if (pass) assert.deepEqual(r, { ok: true, text: body });
        else assert.deepEqual(r, { ok: false, code: 'MESSAGE_TOO_LONG' });
    });
}

// 안 보이는 나쁜 글자: 빈 글자(널)·글 방향 바꿈(RLO)·오른쪽에서 왼쪽 표시(RLM)
const BAD_CHAR_CASES = [
    ['A06-B-014', '\u0000', '널 글자'],
    ['A06-B-015', '‮', '글 방향 바꿈'],
    ['A06-B-016', '‏', '오른쪽→왼쪽 표시'],
];
for (const [no, ch, label] of BAD_CHAR_CASES) {
    test(`${no} 글 사이 ${label} → INVALID_CHARACTERS`, () => {
        assert.deepEqual(rules.sanitizeChatText(`안녕${ch}하세요`), { ok: false, code: 'INVALID_CHARACTERS' });
    });
}

test('A06-B-017 줄바꿈 허용, \\r\\n은 \\n 하나로', () => {
    assert.deepEqual(rules.sanitizeChatText('가\r\n나'), { ok: true, text: '가\n나' });
});

const NON_TEXT_CASES = [
    ['A06-B-018', 123],
    ['A06-B-019', null],
];
for (const [no, value] of NON_TEXT_CASES) {
    test(`${no} 글자가 아닌 값 ${String(value)} → INVALID_CHARACTERS`, () => {
        assert.deepEqual(rules.sanitizeChatText(value), { ok: false, code: 'INVALID_CHARACTERS' });
    });
}

// ---- 낮·죽은 사람 채팅 채널 (생존 × 단계, A06-B-020~026) ----
// 단계로 옮기기: 역할 확인은 판 막 연 그대로, 재판은 광대 아닌 첫 사람을 피고로
const toPhase = (session, phase) => {
    if (phase === 'ROLE_REVEAL') return;
    if (phase === 'DAY') gf.toDay(session);
    if (phase === 'TRIBUNAL') gf.toTribunal(session, gf.nonJokers(session)[0]);
    if (phase === 'NIGHT') { gf.toDay(session); gf.toNight(session); }
};

const CHANNEL_CASES = [
    ['A06-B-020', 'alive', 'ROLE_REVEAL', { ok: false, code: 'INVALID_PHASE' }],
    ['A06-B-021', 'alive', 'DAY', { ok: true, channel: 'DAY' }],
    ['A06-B-022', 'alive', 'TRIBUNAL', { ok: true, channel: 'DAY' }],
    ['A06-B-023', 'alive', 'NIGHT', { ok: false, code: 'INVALID_PHASE' }],
    ['A06-B-024', 'dead', 'DAY', { ok: true, channel: 'DEAD' }],
    ['A06-B-025', 'dead', 'TRIBUNAL', { ok: true, channel: 'DEAD' }],
    ['A06-B-026', 'dead', 'NIGHT', { ok: true, channel: 'DEAD' }],
];
for (const [no, life, phase, expected] of CHANNEL_CASES) {
    test(`${no} ${life === 'alive' ? '산' : '죽은'} 사람 ${phase} 채널 → ${expected.channel ?? expected.code}`, (t) => {
        const s = fresh(t, { id: `a06r-${no}`, n: 6 });
        // 말하는 사람: 피고가 아닌 시민 하나 (광대·피고와 안 겹치게 둘째 광대 아닌 사람)
        const speaker = gf.nonJokers(s)[1];
        toPhase(s, phase);
        assert.equal(s.phase, phase);
        if (life === 'dead') kill(s, speaker);
        assert.deepEqual(rules.resolveGameChatChannel(s, s.players.get(speaker)), expected);
    });
}

test('A06-B-027 죽은 뒤 나가 판 참여 끝난 사람은 낮에 못 씀 → NOT_ELIGIBLE', (t) => {
    const s = fresh(t, { id: 'a06r-027', n: 6 });
    gf.toDay(s);
    const gone = gf.nonJokers(s)[1];
    kill(s, gone);
    const left = core.commitParticipantDeparture(s, gone);
    assert.equal(left.ok, true);
    assert.deepEqual(rules.resolveGameChatChannel(s, s.players.get(gone)), { ok: false, code: 'NOT_ELIGIBLE' });
});

// ---- 채널마다 받는 사람 (A06-B-028~035) ----
test('A06-B-028 낮 채널 받는 사람 = 판 전원 7명 (죽은 2명 포함)', (t) => {
    const s = fresh(t, { id: 'a06r-028', n: 7 });
    gf.toDay(s);
    const [d1, d2] = gf.nonJokers(s);
    kill(s, d1);
    kill(s, d2);
    assert.deepEqual(sortIds(rules.getChatRecipientUuids(s, 'DAY')), sortIds(s.players.keys()));
});

test('A06-B-029 죽은 사람 채널 받는 사람 = 죽은 2명만 (산 5명 없음)', (t) => {
    const s = fresh(t, { id: 'a06r-029', n: 7 });
    gf.toDay(s);
    const [d1, d2] = gf.nonJokers(s);
    kill(s, d1);
    kill(s, d2);
    assert.deepEqual(sortIds(rules.getChatRecipientUuids(s, 'DEAD')), sortIds([d1, d2]));
});

// 10명 판에서 직업마다 한 명씩 죽임 → { 판, 직업별 [산, 죽은] }
const tenWithOneDeadEach = (t, id) => {
    const s = fresh(t, { id, ...TEN_CUSTOM });
    gf.toDay(s);
    gf.toNight(s);
    const pairs = {};
    for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']) {
        const [alive, dead] = gf.byRole(s, role);
        assert.ok(alive && dead, `${role} 2명이 아님`);
        if (role !== 'CITIZEN') kill(s, dead);
        pairs[role] = [alive, dead];
    }
    return { s, pairs };
};

const ROLE_CHANNEL_CASES = [
    ['A06-B-030', 'DOCTOR'],
    ['A06-B-031', 'GUARD'],
    ['A06-B-032', 'WITCH_HUNTER'],
];
for (const [no, role] of ROLE_CHANNEL_CASES) {
    test(`${no} ${role} 채널 = 같은 직업 산 사람 1명만 (죽은 같은 직업 없음)`, (t) => {
        const { s, pairs } = tenWithOneDeadEach(t, `a06r-${no}`);
        assert.deepEqual(rules.getChatRecipientUuids(s, role), [pairs[role][0]]);
    });
}

test('A06-B-033 광대 채널은 죽은 광대도 받음 → 광대 2명 다', (t) => {
    const { s, pairs } = tenWithOneDeadEach(t, 'a06r-033');
    assert.deepEqual(sortIds(rules.getChatRecipientUuids(s, 'JOKER')), sortIds(pairs.JOKER));
});

test('A06-B-034 시민 채널 받는 사람 없음 → 빈 목록', (t) => {
    const { s } = tenWithOneDeadEach(t, 'a06r-034');
    assert.deepEqual(rules.getChatRecipientUuids(s, 'CITIZEN'), []);
});

test('A06-B-035 의사 채널에 다른 직업 안 섞임 (10명 다 산 채)', (t) => {
    const s = fresh(t, { id: 'a06r-035', ...TEN_CUSTOM });
    gf.toDay(s);
    gf.toNight(s);
    const got = rules.getChatRecipientUuids(s, 'DOCTOR');
    const others = [...s.players.values()].filter((p) => p.role !== 'DOCTOR').map((p) => p.uuid);
    assert.equal(got.filter((uuid) => others.includes(uuid)).length, 0);
    assert.deepEqual(sortIds(got), sortIds(gf.byRole(s, 'DOCTOR')));
});
