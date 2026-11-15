'use strict';

// 재판 중 채팅·처형된 사람 흐름 시험: 산 사람·피고 말은 판 전원, 죽은 사람·처형된 사람 말은 죽은 사람끼리, 처형된 사람은 바로 방 만들기 됨
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-191~193, 215, 216
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');
const matchmaking = require('../../socket/matchmaking');
const { installFakeMatchmakingDeps, validSettingsPayload } = require('../helpers/matchmakingFixtures');

const { gf } = W;

// 그 사람이 받은 채팅 글 (낮 채팅·죽은 사람 채팅 둘 다)
const chatTexts = (w, uuid) => w.sock(uuid).received
    .filter((e) => e.event === 'day_chat_message_received' || e.event === 'dead_chat_message_received')
    .map((e) => e.payload.text);

// 죽은 사람 섞인 판 + 재판 진입, 피고·죽은 사람·산 투표자 돌려줌
async function tribunalWithDead(t, { id, n, deadCount }) {
    const w = W.setupWorld(t, { id, n, settings: { tribunalTime: 60 } });
    const citizens = gf.nonJokers(w.session);
    const dead = citizens.slice(0, deadCount);
    W.killAtNights(w, dead);
    const defendant = citizens[deadCount];
    await W.openTribunal(w, defendant);
    return { w, dead, defendant, voters: W.tribunalVoters(w) };
}

test('A04-B-191 7명 판 재판 중 산 투표자가 채팅 → 산 사람·죽은 사람 모두 받음', async (t) => {
    const { w, voters } = await tribunalWithDead(t, { id: 'a04h191', n: 7, deadCount: 2 });
    const text = '산 사람 말 191';
    assert.equal((await W.chat(w, voters[0], text)).ok, true);
    for (const uuid of w.uuids) assert.ok(chatTexts(w, uuid).includes(text), `${uuid} 못 받음`);
});

test('A04-B-192 6명 판 재판 중 피고가 채팅 → 판 전원 받음', async (t) => {
    const { w, defendant } = await tribunalWithDead(t, { id: 'a04h192', n: 6, deadCount: 0 });
    const text = '피고 말 192';
    assert.equal((await W.chat(w, defendant, text)).ok, true);
    for (const uuid of w.uuids) assert.ok(chatTexts(w, uuid).includes(text), `${uuid} 못 받음`);
});

test('A04-B-193 8명 판 재판 중 죽은 사람이 채팅 → 죽은 사람만 받음, 산 사람 0번', async (t) => {
    const { w, dead } = await tribunalWithDead(t, { id: 'a04h193', n: 8, deadCount: 2 });
    const text = '죽은 사람 말 193';
    assert.equal((await W.chat(w, dead[0], text)).ok, true);
    for (const uuid of w.uuids) {
        const got = chatTexts(w, uuid).includes(text);
        assert.equal(got, dead.includes(uuid), `${uuid} 받음=${got}`);
    }
});

test('A04-B-215 6명 판 처형된 A가 판에서 나감 → create_room 받음', async (t) => {
    installFakeMatchmakingDeps(matchmaking);
    t.after(() => matchmaking.__resetStateForTests());
    const { w, defendant: a, voters } = await tribunalWithDead(t, { id: 'a04h215', n: 6, deadCount: 0 });
    for (const uuid of voters) assert.equal((await W.cast(w, uuid, 'GUILTY')).ok, true);
    w.tick(5_000);
    assert.equal(W.lastResolved(w, a).executedUuid, a);
    assert.equal((await W.leave(w, a)).ok, true);
    const reply = await gf.call(matchmaking.__testables.handleCreateRoom, w.io, w.sock(a), a, validSettingsPayload());
    assert.equal(reply.ok, true, `방 만들기 거절: ${reply.code ?? ''} ${reply.message ?? ''}`);
});

test('A04-B-216 5명 판 처형 뒤 A 채팅 → 죽은 사람만 받음', async (t) => {
    const { w, defendant: a, voters } = await tribunalWithDead(t, { id: 'a04h216', n: 5, deadCount: 0 });
    for (const uuid of voters) assert.equal((await W.cast(w, uuid, 'GUILTY')).ok, true);
    w.tick(5_000);
    assert.equal(W.lastResolved(w, a).executedUuid, a);
    const text = '처형된 사람 말 216';
    assert.equal((await W.chat(w, a, text)).ok, true);
    for (const uuid of w.uuids) {
        const deadNow = w.session.players.get(uuid).alive === false;
        assert.equal(chatTexts(w, uuid).includes(text), deadNow, `${uuid}`);
    }
});
