'use strict';

// 즐겨찾기·차단 잘못된 요청 답 시험(시험 DB 씀) — 자기 자신·값 모양·칸 없음·없는 사람·안 한 차단 풀기·친구 끊기 대상
// 목록 A13-B-159~164·561~562 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/flow/a13-relation-answers.test.js
const W = require('../db/a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login, befriend } = W;
const noDb = W.useTestDb(test);

async function setup(t) {
    const call = await W.startServer(t);
    const me = await createUser('me');
    return { call, me, cookie: await login(me) };
}

test('A13-B-159 자기 자신 즐겨찾기 { favorite: true } → 400 "자기 자신을 즐겨찾기할 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const res = await call('PUT', `/friends/favorites/${me}`, { cookie, body: { favorite: true } });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '자기 자신을 즐겨찾기할 수 없습니다.');
});

test('A13-B-160 즐겨찾기 값이 글자 { favorite: "true" } → 400 "favorite 값이 필요합니다."', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const friend = await createUser('fr');
    await befriend(me, friend);
    const res = await call('PUT', `/friends/favorites/${friend}`, { cookie, body: { favorite: 'true' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'favorite 값이 필요합니다.');
    assert.equal(await db.FriendFavorite.count({ where: { owner_id: me } }), 0);
});

test('A13-B-161 자기 자신 차단 → 400 "자기 자신을 차단할 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const res = await call('POST', '/friends/blocks', { cookie, body: { targetId: me } });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '자기 자신을 차단할 수 없습니다.');
});

test('A13-B-162 차단 대상 칸 없음 {} → 400 "targetId가 필요합니다."', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const res = await call('POST', '/friends/blocks', { cookie, body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'targetId가 필요합니다.');
});

test('A13-B-163 없는 사람 차단 → 404 "사용자를 찾을 수 없습니다.", 차단 줄 0', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const res = await call('POST', '/friends/blocks', { cookie, body: { targetId: crypto.randomUUID() } });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '사용자를 찾을 수 없습니다.');
    assert.equal(await db.FriendBlock.count({ where: { owner_id: me } }), 0);
});

test('A13-B-164 안 한 차단 풀기 → 404 "차단 기록을 찾을 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const other = await createUser('oth');
    const res = await call('DELETE', `/friends/blocks/${other}`, { cookie });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '차단 기록을 찾을 수 없습니다.');
});

// 친구 끊기 (2026-11-16 새로 만듦)
test('A13-B-561 자기 자신과 친구 끊기 → 400 "자기 자신과는 친구를 끊을 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const res = await call('DELETE', `/friends/${me}`, { cookie });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '자기 자신과는 친구를 끊을 수 없습니다.');
});

test('A13-B-562 없는 사람(아무 uuid)과 친구 끊기 → 404 "친구가 아닌 사용자입니다.", 내 다른 친구 줄 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const friend = await createUser('fr');
    await befriend(me, friend);
    const res = await call('DELETE', `/friends/${crypto.randomUUID()}`, { cookie });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구가 아닌 사용자입니다.');
    assert.equal(await db.Friendship.count({ where: { requester_id: me, receiver_id: friend } }), 1);
});
