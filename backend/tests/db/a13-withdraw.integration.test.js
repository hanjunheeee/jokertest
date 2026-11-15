'use strict';

// 탈퇴하면 사람 사이 줄 DB 시험 — 친구·신청·즐겨찾기·차단 줄 지움(상대 목록에서 빠짐), 기다리는 초대는 취소(줄은 남음)
// 목록 A13-B-369~373 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-withdraw.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, befriend, block, insertInvite, TEST_PASSWORD } = W;
const { withdrawAccount } = require('../../services/auth/account/withdraw');
const friendService = require('../../services/friend');
const noDb = W.useTestDb(test);

// 탈퇴할 사람(비번 있음)과 친구인 상대
async function pair() {
    const leaver = await createUser('lv', { withPassword: true });
    const other = await createUser('ot');
    await befriend(other, leaver);
    return { leaver, other };
}
const withdraw = async (uuid) => {
    const result = await withdrawAccount({ uuid, password: TEST_PASSWORD });
    assert.equal(result.ok, true);
};
const either = (a, b, uuid) => ({ [db.Sequelize.Op.or]: [{ [a]: uuid }, { [b]: uuid }] });
const inOtherList = async (other, leaver) => (await friendService.getFriendList(other)).some((f) => f.id === leaver);

// A13-B-369~372 표마다: 탈퇴 전 줄을 만들고 탈퇴 뒤 그 사람이 낀 줄 0
for (const [no, table, model, cols, seed] of [
    ['A13-B-369', 'friendships', 'Friendship', ['requester_id', 'receiver_id'], async () => {}],
    ['A13-B-370', 'friend_requests', 'FriendRequest', ['requester_id', 'receiver_id'], async (leaver) => {
        const third = await createUser('th');
        await db.FriendRequest.create({ requester_id: leaver, receiver_id: third, status: 'PENDING' });
        await db.FriendRequest.create({ requester_id: third, receiver_id: leaver, status: 'DECLINED' });
    }],
    ['A13-B-371', 'friend_favorites', 'FriendFavorite', ['owner_id', 'friend_id'], async (leaver, other) => {
        await db.FriendFavorite.create({ owner_id: leaver, friend_id: other });
        await db.FriendFavorite.create({ owner_id: other, friend_id: leaver });
    }],
    ['A13-B-372', 'friend_blocks', 'FriendBlock', ['owner_id', 'blocked_id'], async (leaver) => {
        const third = await createUser('th');
        await block(leaver, third);
        await block(third, leaver);
    }],
]) {
    test(`${no} 탈퇴 → 그 사람이 낀 ${table} 0줄, 상대 친구 목록에서 빠짐`, async (t) => {
        if (noDb(t)) return;
        const { leaver, other } = await pair();
        await seed(leaver, other);
        assert.ok(await db[model].count({ where: either(cols[0], cols[1], leaver) }) > 0, '준비 줄 없음');
        await withdraw(leaver);
        assert.equal(await db[model].count({ where: either(cols[0], cols[1], leaver) }), 0);
        assert.equal(await inOtherList(other, leaver), false);
    });
}

test('A13-B-373 정원 6: 보낸 PENDING 1·받은 PENDING 1 → 탈퇴 → 둘 CANCELLED·end_reason ACCOUNT_WITHDRAWN(줄은 남음)', async (t) => {
    if (noDb(t)) return;
    const { leaver, other } = await pair();
    const sent = await insertInvite(leaver, other);
    const got = await insertInvite(other, leaver);
    await withdraw(leaver);
    for (const invite of [sent, got]) {
        const row = await db.GameInvite.findByPk(invite.id, { raw: true });
        assert.ok(row, '초대 줄이 지워짐');
        assert.equal(row.status, 'CANCELLED');
        assert.equal(row.end_reason, 'ACCOUNT_WITHDRAWN');
    }
});
