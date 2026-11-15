'use strict';

// 초대 거절·끝남 DB 시험 — 거절(DECLINED·revision·두 사람 사건), 남의 초대 거절 404, 3분 지난 초대 거절은 EXPIRED, 판 시작하면 그 방 초대 끝남
// 목록 A13-B-361~364 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-invite-decline.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login, befriend, insertInvite, callController, flush } = W;
const inviteService = require('../../services/friend/gameInvite');
const inviteController = require('../../controllers/friend/invites');
const emitter = require('../../socket/emitter');
// 판 세상은 models 다음에 (A08 것을 읽기만 해서 씀)
const { makeWorld } = require('../flow/a08-world');
const noDb = W.useTestDb(test);

const guestNames = (n) => Array.from({ length: n }, () => `a13-guest-${crypto.randomUUID().slice(0, 8)}`);
const inviteRow = (id) => db.GameInvite.findByPk(id, { raw: true });

// 서버 + 대기방(정원 6) + 민수 → 지유 초대
async function invited(t) {
    const call = await W.startServer(t);
    const w = W.roomWorld(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    await befriend(minsu, jiyu);
    await w.openRoom(minsu, guestNames(1), 6);
    w.connect(jiyu);
    const res = await call('POST', '/friends/invites', { cookie: await login(minsu), body: { receiverId: jiyu, creationKey: `k-${crypto.randomUUID()}` } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return { call, w, minsu, jiyu, inviteId: res.body.data.inviteId, cookieJ: await login(jiyu) };
}

test('A13-B-361 정원 6: 거절 → DECLINED·end_reason DECLINED·decided_at·revision +1, 보낸 사람·받는 사람에게 game_invite_updated 1번씩', async (t) => {
    if (noDb(t)) return;
    const { call, w, minsu, jiyu, inviteId, cookieJ } = await invited(t);
    const before = await inviteRow(inviteId);
    const res = await call('POST', `/friends/invites/${inviteId}/decline`, { cookie: cookieJ });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await inviteRow(inviteId);
    assert.equal(row.status, 'DECLINED');
    assert.equal(row.end_reason, 'DECLINED');
    assert.ok(row.decided_at, 'decided_at 비어 있음');
    assert.equal(row.revision, before.revision + 1);
    assert.equal(w.events(minsu, 'game_invite_updated').length, 1);
    assert.equal(w.events(jiyu, 'game_invite_updated').length, 1);
});

test('A13-B-362 받는 사람 아닌 사람이 거절 → 404, 상태 그대로 PENDING', async (t) => {
    if (noDb(t)) return;
    const { call, inviteId } = await invited(t);
    const third = await createUser('trd');
    const res = await call('POST', `/friends/invites/${inviteId}/decline`, { cookie: await login(third) });
    assert.equal(res.status, 404);
    assert.equal((await inviteRow(inviteId)).status, 'PENDING');
});

test('A13-B-363 +3분 0초에 거절 → 답 상태 EXPIRED, DECLINED 아님', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const sender = await createUser('snd');
    const me = await createUser('me');
    const sentAt = Math.floor(Date.now() / 1000) * 1000;
    const invite = await insertInvite(sender, me, { created_at: new Date(sentAt), expires_at: new Date(sentAt + 3 * 60_000) });
    inviteService.__internal.__setDepsForTests({ now: () => new Date(sentAt + 3 * 60_000) });
    t.after(() => inviteService.__internal.__setDepsForTests(null));
    const res = await call('POST', `/friends/invites/${invite.id}/decline`, { cookie: await login(me) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'EXPIRED');
    assert.equal((await inviteRow(invite.id)).status, 'EXPIRED');
});

test('A13-B-364 5명 판: 대기방 때 보낸 PENDING → 판 시작 → CANCELLED, 두 사람에게 game_invite_updated', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { now: Math.floor(Date.now() / 1000) * 1000 });
    // 이 방의 초대는 진짜 초대 서비스가 다룸 (판 시작 때 취소), 사건은 계정 채널로
    emitter.setIo(w.io);
    t.after(() => emitter.setIo(null));
    require('../../socket/matchmaking').__setGameInviteServiceForTests(inviteService);
    const host = await createUser('h');
    const friend = await createUser('f');
    await befriend(host, friend);
    const people = [host, ...guestNames(4)];
    for (const uuid of [...people, friend]) {
        w.connect(uuid);
        w.sock(uuid).rooms.add(emitter.userChannelOf(uuid));
    }
    const created = await w.createRoom(host, w.roomPayload({ maxPlayers: 6 }));
    assert.equal(created.ok, true);
    for (const uuid of people.slice(1)) assert.equal((await w.joinCode(uuid, created.room.roomCode)).ok, true);
    const made = await callController(inviteController.createInvite, {
        user: { uuid: host }, body: { receiverId: friend, creationKey: `k-${crypto.randomUUID()}` },
    });
    assert.equal(made.status, 201, made.body?.message);
    const inviteId = made.body.data.inviteId;
    for (const uuid of people) assert.equal((await w.ready(uuid)).ok, true);
    const started = await w.start(host, Object.fromEntries([[people[4], 'JOKER']]));
    assert.equal(started.ok, true, `시작 실패: ${started.code}`);
    // 방 초대 취소는 안 기다리고 돎 → 행이 바뀔 때까지 진짜 시간으로 짧게 봄
    let row = null;
    for (let i = 0; i < 400; i += 1) {
        row = await inviteRow(inviteId);
        if (row.status !== 'PENDING') break;
        await flush();
    }
    assert.equal(row.status, 'CANCELLED');
    const updated = (uuid) => w.received(uuid, 'game_invite_updated').filter((p) => p.invite.inviteId === inviteId);
    // 사건은 행을 다시 읽은 뒤 보냄 → 조금 더 흘려보냄
    for (let i = 0; i < 400 && (updated(host).length === 0 || updated(friend).length === 0); i += 1) await flush();
    assert.equal(updated(host).length >= 1, true, '방장 사건 없음');
    assert.equal(updated(friend).length >= 1, true, '받는 사람 사건 없음');
});
