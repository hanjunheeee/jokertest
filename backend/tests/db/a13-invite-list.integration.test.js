'use strict';

// 받은 초대 목록 DB 시험 — 대기 초대만·순번(커서), 목록 읽을 때 3분 지난 것 정리(2:59 있음 / 3:00 없음), 남의 초대 하나 보기 404
// 목록 A13-B-357~360 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-invite-list.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, login, nicknameOf, insertInvite } = W;
const inviteService = require('../../services/friend/gameInvite');
const noDb = W.useTestDb(test);

const listInvites = async (call, cookie) => {
    const res = await call('GET', '/friends/invites', { cookie });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data;
};

test('A13-B-357 나에게 온 PENDING 2 + DECLINED 1(가장 새 것) → 목록 2개(보낸 사람 닉네임), cursor = 끝난 것까지 본 가장 새 순번', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const me = await createUser('me');
    const [a, b, c] = [await createUser('a'), await createUser('b'), await createUser('c')];
    const p1 = await insertInvite(a, me);
    const p2 = await insertInvite(b, me);
    const declined = await insertInvite(c, me, { status: 'DECLINED', end_reason: 'DECLINED', decided_at: new Date() });
    const data = await listInvites(call, await login(me));
    assert.deepEqual(data.invites.map((i) => i.inviteId).sort(), [p1.id, p2.id].sort());
    assert.equal(data.invites.find((i) => i.inviteId === p1.id).senderName, await nicknameOf(a));
    assert.equal(data.invites.find((i) => i.inviteId === p2.id).senderName, await nicknameOf(b));
    const newest = await db.GameInvite.findByPk(declined.id, { raw: true });
    assert.equal(data.cursor, String(newest.creation_seq));
});

// A13-B-358~359 보낸 시각에서 가짜 시각을 넘긴 뒤 목록 읽기
for (const [no, label, afterMs] of [['A13-B-358', '2분 59초', 2 * 60_000 + 59_000], ['A13-B-359', '3분 0초', 3 * 60_000]]) {
    const expired = afterMs >= 3 * 60_000;
    test(`${no} 정원 6: 보낸 뒤 가짜 시각 +${label} → 목록에 ${expired ? '없음, 행 EXPIRED·end_reason EXPIRED' : '있음'}`, async (t) => {
        if (noDb(t)) return;
        const call = await W.startServer(t);
        const me = await createUser('me');
        const sender = await createUser('snd');
        // DB 시각은 초 단위라 초에 맞춘 시각에서 시작
        const sentAt = Math.floor(Date.now() / 1000) * 1000;
        const invite = await insertInvite(sender, me, { created_at: new Date(sentAt), expires_at: new Date(sentAt + 3 * 60_000) });
        inviteService.__internal.__setDepsForTests({ now: () => new Date(sentAt + afterMs) });
        t.after(() => inviteService.__internal.__setDepsForTests(null));
        const data = await listInvites(call, await login(me));
        const row = await db.GameInvite.findByPk(invite.id, { raw: true });
        if (expired) {
            assert.equal(data.invites.some((i) => i.inviteId === invite.id), false);
            assert.equal(row.status, 'EXPIRED');
            assert.equal(row.end_reason, 'EXPIRED');
        } else {
            assert.equal(data.invites.some((i) => i.inviteId === invite.id), true);
            assert.equal(row.status, 'PENDING');
        }
    });
}

test('A13-B-360 제3자가 GET /friends/invites/<남의 초대> → 404 "초대를 찾을 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const [sender, receiver, third] = [await createUser('s'), await createUser('r'), await createUser('t')];
    const invite = await insertInvite(sender, receiver);
    const res = await call('GET', `/friends/invites/${invite.id}`, { cookie: await login(third) });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '초대를 찾을 수 없습니다.');
});
