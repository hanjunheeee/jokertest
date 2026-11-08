'use strict';

// 게임 초대 버그 수정 시험 파일, 방 단위 취소가 끝난 초대 안 덮기 · 받은 초대 목록 읽기 잠금 없음
// 가짜 db를 __setDepsForTests로 넣어 DB 없이 돎
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@127.0.0.1:1/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const gameInviteService = require('../../../services/friend/gameInvite');

// where 한 칸 맞는지 (같은 값 · Op.in · Op.lte만)
const matches = (row, where) => Object.entries(where).every(([key, cond]) => {
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        if (cond[Op.in]) return cond[Op.in].includes(row[key]);
        if (cond[Op.lte]) return row[key].getTime() <= cond[Op.lte].getTime();
        return false;
    }
    return row[key] === cond;
});

// 가짜 db: 초대 행 배열 + 부른 기록
const makeFakeDb = (rows, hooks = {}) => {
    const calls = [];
    const transaction = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    return {
        calls,
        Sequelize: { Op },
        sequelize: {
            literal: (text) => ({ literal: text }),
            transaction: async (work) => work(transaction),
        },
        User: {
            findOne: async (options) => { calls.push(['User.findOne', options.lock ?? null]); return { uuid: options.where.uuid, status: 'ACTIVE' }; },
        },
        GameInvite: {
            findAll: async (options) => {
                calls.push(['GameInvite.findAll']);
                const found = rows.filter((row) => matches(row, options.where)).map((row) => ({ ...row }));
                await hooks.afterFindAll?.();
                return found;
            },
            findOne: async (options) => {
                calls.push(['GameInvite.findOne']);
                const row = rows.find((r) => matches(r, options.where));
                return row ? { ...row } : null;
            },
            update: async (patch, options) => {
                calls.push(['GameInvite.update', options.where]);
                let count = 0;
                for (const row of rows) {
                    if (!matches(row, options.where)) continue;
                    for (const [key, value] of Object.entries(patch)) {
                        row[key] = key === 'revision' ? row.revision + 1 : value;
                    }
                    count += 1;
                }
                return [count];
            },
        },
    };
};

const baseRow = (id, extra = {}) => ({
    id, sender_id: 's', receiver_id: `r-${id}`, room_id: 'room-1', status: 'PENDING', revision: 1,
    creation_seq: 1, created_at: new Date(0), expires_at: new Date(Date.now() + 60_000), ...extra,
});

test('방 단위 취소: 목록 읽은 뒤 그사이 수락된 초대는 CANCELLED로 안 덮음', async (t) => {
    const rows = [baseRow('a'), baseRow('b')];
    const emitted = [];
    const db = makeFakeDb(rows, {
        // 목록 읽은 직후 a가 수락됨 (잠금 없는 틈)
        afterFindAll: async () => { rows[0].status = 'ACCEPTED'; },
    });
    gameInviteService.__internal.__setDepsForTests({ db, emitToUser: (userId, event, payload) => emitted.push(payload.invite.inviteId) });
    t.after(() => gameInviteService.__internal.__setDepsForTests(null));

    const cancelled = await gameInviteService.cancelPendingInvitesForRoom('room-1', 'ROOM_CLOSED');

    assert.equal(rows[0].status, 'ACCEPTED', '수락된 초대는 그대로');
    assert.equal(rows[1].status, 'CANCELLED');
    assert.deepEqual(cancelled, ['b']);
    assert.deepEqual([...new Set(emitted)], ['b'], '이번에 취소된 초대만 전송');
});

test('BE-067: 받은 초대 목록 읽기는 계정 행을 잠그지 않고, 지난 초대 만료는 그대로 함', async (t) => {
    const rows = [
        baseRow('old', { receiver_id: 'me', expires_at: new Date(Date.now() - 1000) }),
        baseRow('live', { receiver_id: 'me', creation_seq: 2 }),
    ];
    const db = makeFakeDb(rows);
    gameInviteService.__internal.__setDepsForTests({ db, emitToUser: () => {} });
    t.after(() => gameInviteService.__internal.__setDepsForTests(null));

    const snapshot = await gameInviteService.getReceiverSnapshot('me');

    assert.equal(db.calls.some(([name]) => name === 'User.findOne'), false, '계정 행 FOR UPDATE 없음');
    assert.equal(rows[0].status, 'EXPIRED');
    assert.deepEqual(snapshot.invites.map((invite) => invite.inviteId), ['live']);
});
