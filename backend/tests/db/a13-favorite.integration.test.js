'use strict';

// 즐겨찾기 DB 시험 — 내 쪽만 표시, 두 번 켜도 한 줄, 끄기, 친구 아님·차단 사이 거절, 차단했다 풀면 별이 다시
// 목록 A13-B-328~334 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-favorite.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, login, befriend, block } = W;
const noDb = W.useTestDb(test);

// 서버 + 친구인 민수·지유 (로그인)
async function setup(t, { friends = true } = {}) {
    const call = await W.startServer(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    if (friends) await befriend(minsu, jiyu);
    return { call, minsu, jiyu, cookieM: await login(minsu), cookieJ: await login(jiyu) };
}
const setFavorite = (call, cookie, friendId, favorite) => call('PUT', `/friends/favorites/${friendId}`, { cookie, body: { favorite } });
const favoriteRows = (owner) => db.FriendFavorite.count({ where: { owner_id: owner } });
const friendInList = async (call, cookie, uuid) => (await call('GET', '/friends', { cookie })).body.data.find((f) => f.id === uuid);

test('A13-B-328 민수가 지유 켬 → friend_favorites 1줄, 민수 목록 지유 isFavorite true, 지유 목록 민수 false', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    assert.equal((await setFavorite(call, cookieM, jiyu, true)).status, 200);
    assert.equal(await favoriteRows(minsu), 1);
    assert.equal((await friendInList(call, cookieM, jiyu)).isFavorite, true);
    assert.equal((await friendInList(call, cookieJ, minsu)).isFavorite, false);
});

test('A13-B-329 두 번 켜도 한 줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    assert.equal((await setFavorite(call, cookieM, jiyu, true)).status, 200);
    assert.equal((await setFavorite(call, cookieM, jiyu, true)).status, 200);
    assert.equal(await favoriteRows(minsu), 1);
});

test('A13-B-330 끄기 → 0줄, isFavorite false', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    assert.equal((await setFavorite(call, cookieM, jiyu, true)).status, 200);
    assert.equal((await setFavorite(call, cookieM, jiyu, false)).status, 200);
    assert.equal(await favoriteRows(minsu), 0);
    assert.equal((await friendInList(call, cookieM, jiyu)).isFavorite, false);
});

test('A13-B-331 친구 아닌 사람 → 404 "친구가 아닌 사용자는 즐겨찾기할 수 없습니다.", 0줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t, { friends: false });
    const res = await setFavorite(call, cookieM, jiyu, true);
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구가 아닌 사용자는 즐겨찾기할 수 없습니다.');
    assert.equal(await favoriteRows(minsu), 0);
});

for (const [no, label, mine] of [['A13-B-332', '내가 차단한 친구', true], ['A13-B-333', '나를 차단한 친구', false]]) {
    test(`${no} ${label} 켜기 → 403 "차단 관계인 사용자는 즐겨찾기할 수 없습니다."`, async (t) => {
        if (noDb(t)) return;
        const { call, minsu, jiyu, cookieM } = await setup(t);
        if (mine) await block(minsu, jiyu);
        else await block(jiyu, minsu);
        const res = await setFavorite(call, cookieM, jiyu, true);
        assert.equal(res.status, 403);
        assert.equal(res.body.message, '차단 관계인 사용자는 즐겨찾기할 수 없습니다.');
        assert.equal(await favoriteRows(minsu), 0);
    });
}

test('A13-B-334 켬 → 차단 → 풀기 → 목록 isFavorite true', async (t) => {
    if (noDb(t)) return;
    const { call, jiyu, cookieM } = await setup(t);
    assert.equal((await setFavorite(call, cookieM, jiyu, true)).status, 200);
    assert.equal((await call('POST', '/friends/blocks', { cookie: cookieM, body: { targetId: jiyu } })).status, 200);
    assert.equal((await call('DELETE', `/friends/blocks/${jiyu}`, { cookie: cookieM })).status, 200);
    const row = await friendInList(call, cookieM, jiyu);
    assert.ok(row, '풀었는데 친구 목록에 없음');
    assert.equal(row.isFavorite, true);
});
