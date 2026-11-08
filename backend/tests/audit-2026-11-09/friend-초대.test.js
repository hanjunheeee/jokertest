'use strict';

// 게임 초대 시험: 보내기(방·친구·차단·중복·받는 사람 상태)·받은 목록 만료·하나 보기·거절·방 단위 취소·둘 사이 취소·수락 결정·입장 중단 기록
// 가짜 db를 __setDepsForTests로 넣고 시각도 가짜 (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const gameInviteService = require('../../services/friend/gameInvite');
const friendshipRepository = require('../../repositories/friend/friendship');
const blockRepository = require('../../repositories/friend/block');
const notificationService = require('../../services/notification');

const restoreStacks = new WeakMap();
const swap = (t, target, name, impl) => {
    if (!restoreStacks.has(t)) {
        const stack = [];
        restoreStacks.set(t, stack);
        t.after(() => { while (stack.length) stack.pop()(); });
    }
    const original = target[name];
    target[name] = impl;
    restoreStacks.get(t).push(() => { target[name] = original; });
};

const NOW = new Date('2026-11-09T12:00:00Z');
const BOOT = 'boot-test';

// where 맞추기 (같은 값 · Op.in · Op.lte · Op.gt · Op.or)
const matches = (row, where) => Object.entries(where).every(([key, cond]) => {
    if (key === Op.or) return false;
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        if (cond[Op.in]) return cond[Op.in].includes(row[key]);
        if (cond[Op.lte]) return row[key].getTime() <= cond[Op.lte].getTime();
        if (cond[Op.gt]) return row[key].getTime() > cond[Op.gt].getTime();
        return false;
    }
    return row[key] === cond;
}) && (where[Op.or] ? where[Op.or].some((alt) => matches(row, alt)) : true);

// 행 객체에 update·reload·get 붙임 (모델 행 흉내)
const wrap = (rows, row) => {
    const record = row;
    record.update = async (patch) => { Object.assign(record, patch); return record; };
    record.reload = async () => record;
    return record;
};

const makeDb = (rows = []) => {
    const created = [];
    const db = {
        rows,
        created,
        Sequelize: { Op },
        sequelize: {
            literal: (text) => ({ literal: text }),
            transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }),
        },
        User: { findOne: async ({ where }) => ({ uuid: where.uuid, nickname: `닉-${where.uuid}`, status: 'ACTIVE' }) },
        GameInvite: {
            findOne: async ({ where, order }) => {
                const found = rows.filter((r) => matches(r, where));
                if (order) found.sort((a, b) => b.creation_seq - a.creation_seq);
                return found[0] ?? null;
            },
            findAll: async ({ where }) => rows.filter((r) => matches(r, where)),
            update: async (patch, { where }) => {
                let count = 0;
                for (const row of rows) {
                    if (!matches(row, where)) continue;
                    for (const [k, v] of Object.entries(patch)) row[k] = k === 'revision' && v?.literal ? row.revision + 1 : v;
                    count += 1;
                }
                return [count];
            },
            create: async (row) => { const r = wrap(rows, { ...row, creation_seq: rows.length + 1 }); rows.push(r); created.push(r); return r; },
        },
    };
    return db;
};

const inviteRow = (overrides = {}) => wrap(null, {
    id: 'inv-1', sender_id: 'host', receiver_id: 'guest', room_id: 'room-1', room_instance_id: 'inst-1',
    boot_epoch: BOOT, creation_key: 'k1', status: 'PENDING', revision: 1, creation_seq: 1,
    created_at: new Date(NOW.getTime() - 1000), expires_at: new Date(NOW.getTime() + 60_000), ...overrides,
});

// 주입: 가짜 db·시각·전송, 방 접근자
const setup = (t, { rows = [], room = { roomId: 'room-1', roomInstanceId: 'inst-1', isFull: false }, availability = { available: true, code: null } } = {}) => {
    const db = makeDb(rows);
    const emitted = [];
    let seq = 0;
    gameInviteService.__internal.__setDepsForTests({
        db,
        now: () => new Date(NOW),
        newId: () => `new-${++seq}`,
        emitToUser: (userId, event, payload) => emitted.push({ userId, event, payload }),
    });
    gameInviteService.__setRoomAccessForRuntime({
        bootEpoch: BOOT,
        getRoomIdForUser: (uuid) => (uuid === 'host' && room ? room.roomId : null),
        describeRoomForInvite: () => room,
        describeReceiverAvailability: () => availability,
    });
    t.after(() => {
        gameInviteService.__internal.__setDepsForTests(null);
        gameInviteService.__setRoomAccessForRuntime(null);
    });
    return { db, emitted };
};

// 친구·차단·계정 가짜
const relationFakes = (t, { friend = true, blocked = false, receiverStatus = 'ACTIVE' } = {}) => {
    swap(t, friendshipRepository, 'lockAccountsInOrder', async (uuids) => [...new Set(uuids)].sort().map((uuid) => ({ uuid, status: uuid === 'guest' ? receiverStatus : 'ACTIVE' })));
    swap(t, friendshipRepository, 'findExistingFriendship', async () => (friend ? { status: 'ACCEPTED' } : null));
    swap(t, blockRepository, 'findBlocksBetween', async () => (blocked ? [{}] : []));
    const notifications = [];
    swap(t, notificationService, 'createForGameInvite', async (input) => { notifications.push(input); return { created: true, notification: { id: 'n-inv' } }; });
    swap(t, notificationService, 'emitNotificationCreated', () => {});
    return notifications;
};

const rejects = (promise, status, code) => assert.rejects(promise, (err) => {
    assert.equal(err.status ?? err.statusCode, status);
    if (code) assert.equal(err.code, code);
    return true;
});

// ── 보내기 ──
test('초대 보내기: 성공하면 201용 created true, 3분 뒤 만료, 받는 사람에게 game_invite_received', async (t) => {
    const { db, emitted } = setup(t);
    const notifications = relationFakes(t);
    const res = await gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: ' k1 ' });
    assert.equal(res.created, true);
    assert.equal(res.invite.status, 'PENDING');
    assert.equal(new Date(res.invite.expiresAt).getTime() - NOW.getTime(), gameInviteService.INVITE_TTL_MS);
    assert.equal(db.created[0].creation_key, 'k1');
    assert.equal(db.created[0].boot_epoch, BOOT);
    assert.equal(emitted[0].event, 'game_invite_received');
    assert.equal(emitted[0].payload.sfxEvent.eventId, `game-invite:${res.invite.inviteId}:received`);
    assert.equal(notifications[0].receiverId, 'guest');
});

test('초대 보내기: 나 자신이면 400', async (t) => {
    setup(t);
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'host', creationKey: 'k' }), 400);
});

test('초대 보내기: 만들기 키 없거나 120자 넘으면 400', async (t) => {
    setup(t);
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: '  ' }), 400);
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'x'.repeat(121) }), 400);
});

test('초대 보내기: 보내는 사람 대기방 없으면 409 (DB 안 감)', async (t) => {
    setup(t, { room: null });
    let locked = 0;
    swap(t, friendshipRepository, 'lockAccountsInOrder', async () => { locked += 1; return []; });
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k' }), 409);
    assert.equal(locked, 0);
});

test('초대 보내기: 방 꽉 찼으면 409', async (t) => {
    setup(t, { room: { roomId: 'room-1', roomInstanceId: 'inst-1', isFull: true } });
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k' }), 409);
});

test('초대 보내기: 친구 아니면 403', async (t) => {
    setup(t);
    relationFakes(t, { friend: false });
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k' }), 403);
});

test('초대 보내기: 차단 관계면 403', async (t) => {
    setup(t);
    relationFakes(t, { blocked: true });
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k' }), 403);
});

test('초대 보내기: 받는 사람 정지면 403', async (t) => {
    setup(t);
    relationFakes(t, { receiverStatus: 'SUSPENDED' });
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k' }), 403);
});

test('초대 보내기: 받는 사람이 다른 방에 있으면 409 RECEIVER_IN_ROOM', async (t) => {
    setup(t, { availability: { available: false, code: 'RECEIVER_IN_ROOM' } });
    relationFakes(t);
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k' }), 409, 'RECEIVER_IN_ROOM');
});

test('초대 보내기: 같은 만들기 키 다시 오면 처음 초대 그대로 (created false, 전송 없음)', async (t) => {
    const { emitted, db } = setup(t, { rows: [inviteRow()] });
    relationFakes(t);
    const res = await gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k1' });
    assert.equal(res.created, false);
    assert.equal(res.invite.inviteId, 'inv-1');
    assert.equal(db.created.length, 0);
    assert.equal(emitted.length, 0);
});

test('초대 보내기: 같은 키로 다른 상대면 409', async (t) => {
    setup(t, { rows: [inviteRow({ receiver_id: 'someone' })] });
    relationFakes(t);
    await rejects(gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'k1' }), 409);
});

test('초대 보내기: 같은 방에 살아 있는 대기 초대 있으면 새로 안 만듦', async (t) => {
    const { db } = setup(t, { rows: [inviteRow({ creation_key: 'other' })] });
    relationFakes(t);
    const res = await gameInviteService.createInvite({ senderId: 'host', receiverId: 'guest', creationKey: 'fresh' });
    assert.equal(res.created, false);
    assert.equal(db.created.length, 0);
});

// ── 받은 목록·하나 보기 ──
test('받은 목록: 시간 지난 대기 초대는 만료로 바꾸고 살아 있는 것만, 순번 커서', async (t) => {
    const rows = [
        inviteRow({ id: 'old', expires_at: new Date(NOW.getTime() - 1) }),
        inviteRow({ id: 'live', creation_seq: 2 }),
    ];
    setup(t, { rows });
    const snap = await gameInviteService.getReceiverSnapshot('guest');
    assert.deepEqual(snap.invites.map((i) => i.inviteId), ['live']);
    assert.equal(rows[0].status, 'EXPIRED');
    assert.equal(rows[0].end_reason, 'EXPIRED');
    assert.equal(snap.cursor, '2');
});

test('받은 목록: 만료 시각이 지금과 같으면 만료 (<=)', async (t) => {
    const rows = [inviteRow({ expires_at: new Date(NOW) })];
    setup(t, { rows });
    const snap = await gameInviteService.getReceiverSnapshot('guest');
    assert.equal(snap.invites.length, 0);
    assert.equal(rows[0].status, 'EXPIRED');
});

test('받은 목록: 받는 사람 없으면 빈 목록 커서 0', async (t) => {
    setup(t);
    assert.deepEqual(await gameInviteService.getReceiverSnapshot(''), { invites: [], cursor: '0' });
});

test('하나 보기: 보낸 사람·받는 사람 아니면 404', async (t) => {
    setup(t, { rows: [inviteRow()] });
    await rejects(gameInviteService.getInviteForUser('stranger', 'inv-1'), 404);
});

test('하나 보기: 보낸 사람은 볼 수 있음', async (t) => {
    setup(t, { rows: [inviteRow()] });
    const invite = await gameInviteService.getInviteForUser('host', 'inv-1');
    assert.equal(invite.inviteId, 'inv-1');
});

// ── 거절·취소 ──
test('거절: 대기 초대면 DECLINED·revision 2, 두 사람에게 game_invite_updated', async (t) => {
    const rows = [inviteRow()];
    const { emitted } = setup(t, { rows });
    const invite = await gameInviteService.declineInvite('guest', 'inv-1');
    assert.equal(invite.status, 'DECLINED');
    assert.equal(invite.revision, 2);
    assert.deepEqual(emitted.map((e) => [e.userId, e.event]), [['host', 'game_invite_updated'], ['guest', 'game_invite_updated']]);
});

test('거절: 이미 끝난 초대면 안 바꾸고 전송 없음', async (t) => {
    const { emitted } = setup(t, { rows: [inviteRow({ status: 'CANCELLED' })] });
    const invite = await gameInviteService.declineInvite('guest', 'inv-1');
    assert.equal(invite.status, 'CANCELLED');
    assert.equal(emitted.length, 0);
});

test('거절: 남의 초대면 404', async (t) => {
    setup(t, { rows: [inviteRow()] });
    await rejects(gameInviteService.declineInvite('host', 'inv-1'), 404);
});

test('거절: 이미 만료 시각 지났으면 만료로 바뀌고 거절 안 됨', async (t) => {
    const rows = [inviteRow({ expires_at: new Date(NOW.getTime() - 5) })];
    setup(t, { rows });
    const invite = await gameInviteService.declineInvite('guest', 'inv-1');
    assert.equal(invite.status, 'EXPIRED');
});

test('방 단위 취소: 그 방 대기 초대만 CANCELLED, 다른 방은 그대로', async (t) => {
    const rows = [inviteRow({ id: 'a' }), inviteRow({ id: 'b', room_id: 'room-2' })];
    setup(t, { rows });
    const ids = await gameInviteService.cancelPendingInvitesForRoom('room-1', 'ROOM_GONE');
    assert.deepEqual(ids, ['a']);
    assert.equal(rows[0].status, 'CANCELLED');
    assert.equal(rows[0].end_reason, 'ROOM_GONE');
    assert.equal(rows[1].status, 'PENDING');
});

test('방 단위 취소: 방 id 없으면 빈 목록', async (t) => {
    setup(t);
    assert.deepEqual(await gameInviteService.cancelPendingInvitesForRoom('', 'X'), []);
});

test('둘 사이 취소: 누가 보냈든 대기 초대 취소, 전송은 안 함', async (t) => {
    const rows = [inviteRow({ id: 'a' }), inviteRow({ id: 'b', sender_id: 'guest', receiver_id: 'host' }), inviteRow({ id: 'c', receiver_id: 'x' })];
    const { db, emitted } = setup(t, { rows });
    const ids = await gameInviteService.cancelPendingInvitesBetween('host', 'guest', 'BLOCKED', { db });
    assert.deepEqual(ids.sort(), ['a', 'b']);
    assert.equal(rows[2].status, 'PENDING');
    assert.equal(emitted.length, 0);
});

// ── 수락 결정·입장 중단 ──
test('수락 결정: 대기 초대면 ACCEPTED·시도 id·입장 확인 전', async (t) => {
    const rows = [inviteRow()];
    setup(t, { rows });
    relationFakes(t);
    const res = await gameInviteService.recordAcceptDecision({ receiverId: 'guest', inviteId: 'inv-1', attemptId: 'att-1', bootEpoch: BOOT });
    assert.equal(res.ok, true);
    assert.equal(res.roomId, 'room-1');
    assert.equal(rows[0].status, 'ACCEPTED');
    assert.equal(rows[0].attempt_id, 'att-1');
    assert.equal(rows[0].entry_outcome, 'UNCONFIRMED');
});

test('수락 결정: 같은 시도로 다시 부르면 resumed', async (t) => {
    setup(t, { rows: [inviteRow({ status: 'ACCEPTED', attempt_id: 'att-1' })] });
    relationFakes(t);
    const res = await gameInviteService.recordAcceptDecision({ receiverId: 'guest', inviteId: 'inv-1', attemptId: 'att-1', bootEpoch: BOOT });
    assert.equal(res.resumed, true);
});

test('수락 결정: 서버 다시 켜기 전 초대면 취소 저장 뒤 409 SERVER_RESTARTED', async (t) => {
    const rows = [inviteRow()];
    setup(t, { rows });
    relationFakes(t);
    await rejects(gameInviteService.recordAcceptDecision({ receiverId: 'guest', inviteId: 'inv-1', attemptId: 'a', bootEpoch: 'new-boot' }), 409, 'SERVER_RESTARTED');
    assert.equal(rows[0].status, 'CANCELLED');
    assert.equal(rows[0].end_reason, 'SERVER_RESTARTED');
});

test('수락 결정: 만료된 초대면 409 EXPIRED', async (t) => {
    setup(t, { rows: [inviteRow({ expires_at: new Date(NOW.getTime() - 1) })] });
    relationFakes(t);
    await rejects(gameInviteService.recordAcceptDecision({ receiverId: 'guest', inviteId: 'inv-1', attemptId: 'a', bootEpoch: BOOT }), 409, 'EXPIRED');
});

test('수락 결정: 그사이 차단됐으면 403 BLOCKED', async (t) => {
    setup(t, { rows: [inviteRow()] });
    relationFakes(t, { blocked: true });
    await rejects(gameInviteService.recordAcceptDecision({ receiverId: 'guest', inviteId: 'inv-1', attemptId: 'a', bootEpoch: BOOT }), 403, 'BLOCKED');
});

test('입장 중단 기록: 확인 전 시도만 INTERRUPTED, 시도 id 없으면 false', async (t) => {
    const rows = [inviteRow({ status: 'ACCEPTED', attempt_id: 'att-1', entry_outcome: 'UNCONFIRMED' })];
    setup(t, { rows });
    assert.equal(await gameInviteService.recordEntryInterrupted({ inviteId: 'inv-1', attemptId: '', reason: 'X' }), false);
    assert.equal(await gameInviteService.recordEntryInterrupted({ inviteId: 'inv-1', attemptId: 'other', reason: 'X' }), false);
    assert.equal(await gameInviteService.recordEntryInterrupted({ inviteId: 'inv-1', attemptId: 'att-1', reason: 'DISCONNECTED' }), true);
    assert.equal(rows[0].entry_outcome, 'INTERRUPTED');
    assert.equal(rows[0].end_reason, 'DISCONNECTED');
});

test('순번 비교: 길이 먼저 봄 (BIGINT 문자열)', () => {
    assert.ok(gameInviteService.compareSeq('10', '9') > 0);
    assert.ok(gameInviteService.compareSeq('0009', '10') < 0);
    assert.equal(gameInviteService.compareSeq('12345678901234567890', '12345678901234567890'), 0);
});
