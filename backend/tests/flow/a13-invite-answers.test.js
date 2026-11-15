'use strict';

// 게임 초대 잘못된 요청 답 시험(시험 DB 씀) — 받는 사람 칸 없음, 만들기 키 모양(없음·공백·121자·120자), 없는 사람
// 목록 A13-B-165~170 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 방은 정원 6 · 지금 2명
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/flow/a13-invite-answers.test.js
const W = require('../db/a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login, befriend } = W;
const noDb = W.useTestDb(test);

// 정원 6 · 지금 2명 방의 방장(로그인함) + 방 밖 친구
async function setup(t) {
    const call = await W.startServer(t);
    const w = W.roomWorld(t);
    const host = await createUser('h');
    const friend = await createUser('f');
    await befriend(host, friend);
    await w.openRoom(host, [`a13-guest-${crypto.randomUUID().slice(0, 8)}`], 6);
    assert.equal((await w.currentRoom(host)).players.length, 2);
    w.connect(friend);
    return { call, host, friend, cookie: await login(host) };
}
const inviteRows = (host) => db.GameInvite.count({ where: { sender_id: host } });

test('A13-B-165 초대 받는 사람 칸 없음 { creationKey } → 400 "초대할 상대를 지정해야 합니다."', async (t) => {
    if (noDb(t)) return;
    const { call, host, cookie } = await setup(t);
    const res = await call('POST', '/friends/invites', { cookie, body: { creationKey: 'k-165' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '초대할 상대를 지정해야 합니다.');
    assert.equal(await inviteRows(host), 0);
});

// A13-B-166~168 만들기 키가 틀리면 400
for (const [no, label, key] of [
    ['A13-B-166', '키 없음', undefined],
    ['A13-B-167', '공백만', '    '],
    ['A13-B-168', '121자', 'k'.repeat(121)],
]) {
    test(`${no} 초대 만들기 키 ${label} → 400 "초대 생성 키가 필요합니다."`, async (t) => {
        if (noDb(t)) return;
        const { call, host, friend, cookie } = await setup(t);
        const res = await call('POST', '/friends/invites', { cookie, body: { receiverId: friend, creationKey: key } });
        assert.equal(res.status, 400);
        assert.equal(res.body.message, '초대 생성 키가 필요합니다.');
        assert.equal(await inviteRows(host), 0);
    });
}

test('A13-B-169 초대 만들기 키 120자 → 통과(201, 초대 1줄)', async (t) => {
    if (noDb(t)) return;
    const { call, host, friend, cookie } = await setup(t);
    const res = await call('POST', '/friends/invites', { cookie, body: { receiverId: friend, creationKey: 'k'.repeat(120) } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(await inviteRows(host), 1);
});

test('A13-B-170 없는 사람 초대 → 404 "초대할 사용자를 찾을 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, host, cookie } = await setup(t);
    const res = await call('POST', '/friends/invites', { cookie, body: { receiverId: crypto.randomUUID(), creationKey: 'k-170' } });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '초대할 사용자를 찾을 수 없습니다.');
    assert.equal(await inviteRows(host), 0);
});
