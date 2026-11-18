'use strict';

// 낮 채팅(150자·0.5초 간격·투표 중에도)과 낮엔 직업 능력이 안 되는지 서버 흐름 시험
// 목록 A03-낮투표.md 번호 A03-B-243~252
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 그 글이 판 다른 사람 전원에게 간 횟수
const deliveredTo = (g, sender, text) => g.ids.filter((u) => u !== sender)
    .filter((u) => g.got(u, 'day_chat_message_received').some((m) => m.text === text && m.senderUuid === sender));

async function sixAtDiscussion(t, id) {
    const g = H.setup(t, { id, n: 6 });
    g.advance(2_000);
    return { g, sender: g.aliveNonJokers()[0] };
}

[[243, 149], [244, 150]].forEach(([no, len]) => {
    test(`A03-B-${no} 6명 판 토론: ${len}자 채팅 → 받음, 판 다른 사람 전원에게 감`, async (t) => {
        const { g, sender } = await sixAtDiscussion(t, `b${no}`);
        const text = '가'.repeat(len);
        const ack = await g.chat(sender, text);
        assert.equal(ack.ok, true);
        assert.equal(deliveredTo(g, sender, text).length, 5);
    });
});

test('A03-B-245 6명 판 토론: 151자 채팅 → MESSAGE_TOO_LONG 거절, 아무에게도 안 감', async (t) => {
    const { g, sender } = await sixAtDiscussion(t, 'b245');
    const text = '가'.repeat(151);
    const ack = await g.chat(sender, text);
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'MESSAGE_TOO_LONG');
    assert.deepEqual(g.missing('day_chat_message_received', 0), []);
});

test('A03-B-246 6명 판 토론: 0.4초 뒤 두 번째 채팅 → 거절', async (t) => {
    const { g, sender } = await sixAtDiscussion(t, 'b246');
    assert.equal((await g.chat(sender, '첫 줄')).ok, true);
    g.advance(400);
    const ack = await g.chat(sender, '둘째 줄');
    assert.equal(ack.ok, false);
    assert.equal(deliveredTo(g, sender, '둘째 줄').length, 0);
});

test('A03-B-247 6명 판 토론: 0.5초 뒤 두 번째 채팅 → 받음', async (t) => {
    const { g, sender } = await sixAtDiscussion(t, 'b247');
    assert.equal((await g.chat(sender, '첫 줄')).ok, true);
    g.advance(500);
    assert.equal((await g.chat(sender, '둘째 줄')).ok, true);
    assert.equal(deliveredTo(g, sender, '둘째 줄').length, 5);
});

test('A03-B-248 6명 판: 투표 단계에도 산 사람 채팅 받음', async (t) => {
    const g = H.setup(t, { id: 'b248', n: 6 });
    g.toVote();
    const sender = g.aliveNonJokers()[0];
    assert.equal((await g.chat(sender, '투표 중 한마디')).ok, true);
    assert.equal(deliveredTo(g, sender, '투표 중 한마디').length, 5);
});

// A03-B-249~252 낮엔 직업 능력 없음 (10명 판, 낮 투표 중 밤 행동 보냄 → 거절, 그 밤 결과 안 생김)
['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'].forEach((role, i) => {
    test(`A03-B-${249 + i} 10명 판 낮 투표 중: ${role}이 밤 행동 보냄 → 거절, 그 뒤 밤 결과 안 생김`, async (t) => {
        const g = H.setup(t, { id: `b${249 + i}`, n: 10 });
        g.toVote();
        const [actor] = g.byRole(role);
        assert.ok(actor, `${role} 없음`);
        const target = g.alive().find((u) => u !== actor && u !== g.joker);
        const ack = await g.night(actor, target);
        assert.equal(ack.ok, false);

        // 낮을 전원 기권으로 끝내고 밤에 아무도 안 고름 → 낮에 보낸 것이 남았으면 결과가 생김
        const { votes } = H.allocate(g.alive(), { abstain: 10 });
        for (const vack of await g.voteAll(votes)) assert.equal(vack.ok, true);
        g.advance(5_000);
        const applied = g.passNight();
        assert.equal(applied.victimUuid, null);
        assert.equal(Object.hasOwn(applied, 'doctorSaved'), false);
        assert.equal(g.got(actor, 'night_action_result').length, 0);
    });
});
