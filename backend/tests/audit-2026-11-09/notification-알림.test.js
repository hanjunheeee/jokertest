'use strict';

// 알림 시험: 만들기(출처 키로 한 번만·동시 만들기 경쟁)·종류별 문구·환영 알림·목록·읽음·읽은 것 지우기·전송·컨트롤러·저장소
// 가짜 db를 __setDepsForTests로 넣고 시각·id도 가짜 (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const notificationService = require('../../services/notification');
const notificationRepository = require('../../repositories/notification');
const notificationController = require('../../controllers/notification.controller');

const NOW = new Date('2026-11-09T09:00:00Z');
const ID = '11111111-2222-4333-8444-555555555555';

const uniqueError = (fields) => {
    const error = new Error('dup');
    error.name = 'SequelizeUniqueConstraintError';
    error.fields = fields;
    return error;
};

// 가짜 알림 db (행 배열 + 부른 기록)
const makeDb = (rows = [], hooks = {}) => {
    const calls = [];
    const same = (row, where) => Object.entries(where).every(([k, v]) => {
        if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            // 진짜 DB처럼 여러 조건 함께 (ne·in·notIn)
            if (Op.ne in v && row[k] === v[Op.ne]) return false;
            if (Op.in in v && !v[Op.in].includes(row[k])) return false;
            if (Op.notIn in v && v[Op.notIn].includes(row[k])) return false;
            return true;
        }
        return row[k] === v;
    });
    return {
        rows,
        calls,
        sequelize: { transaction: async (work) => work({ LOCK: { SHARE: 'SHARE', UPDATE: 'UPDATE' } }) },
        Notification: {
            findOrCreate: async ({ where, defaults }) => {
                calls.push('findOrCreate');
                if (hooks.findOrCreate) return hooks.findOrCreate({ where, defaults });
                const found = rows.find((r) => same(r, where));
                if (found) return [found, false];
                rows.push({ ...defaults });
                return [rows.at(-1), true];
            },
            findOne: async (options) => { calls.push(['findOne', options.lock ?? null]); return rows.find((r) => same(r, options.where)) ?? null; },
            findAll: async (options) => { calls.push(['findAll', options.limit, options.order]); return rows.filter((r) => same(r, options.where)); },
            update: async (patch, { where }) => {
                let n = 0;
                for (const r of rows) if (same(r, where)) { Object.assign(r, patch); n += 1; }
                return [n];
            },
            destroy: async ({ where }) => {
                const keep = rows.filter((r) => !same(r, where));
                const n = rows.length - keep.length;
                rows.splice(0, rows.length, ...keep);
                return n;
            },
        },
    };
};

const setup = (t, rows = [], hooks = {}) => {
    const db = makeDb(rows, hooks);
    const emitted = [];
    notificationService.__internal.__setDepsForTests({
        db,
        now: () => new Date(NOW),
        newId: () => ID,
        emitToUser: (userId, event, payload) => emitted.push({ userId, event, payload }),
    });
    t.after(() => notificationService.__internal.__setDepsForTests(null));
    return { db, emitted };
};

const row = (overrides = {}) => ({
    id: ID, user_id: 'me', type: 'system', source_key: 's', title: 't', body: 'b', target: null,
    created_at: NOW, read_at: null, ...overrides,
});

const rejects = (promise, status) => assert.rejects(promise, (err) => { assert.equal(err.status ?? err.statusCode, status); return true; });

// ── 만들기 ──
test('만들기: 새 출처 키면 created true와 화면 모양', async (t) => {
    setup(t);
    const res = await notificationService.createNotification({ userId: 'me', type: 'system', sourceKey: 'k', title: '제목', body: '본문' });
    assert.equal(res.created, true);
    assert.deepEqual(res.notification, {
        id: ID, type: 'system', sourceKey: 'k', title: '제목', body: '본문', target: null, createdAt: NOW, readAt: null,
    });
});

test('만들기: 같은 출처 키 두 번이면 두 번째는 created false, 행 하나', async (t) => {
    const { db } = setup(t);
    await notificationService.createNotification({ userId: 'me', type: 'system', sourceKey: 'k', title: 'a', body: 'b' });
    const again = await notificationService.createNotification({ userId: 'me', type: 'system', sourceKey: 'k', title: 'a', body: 'b' });
    assert.equal(again.created, false);
    assert.equal(db.rows.length, 1);
});

test('만들기: 대상 계정·출처 키 없으면 500', async (t) => {
    setup(t);
    await rejects(notificationService.createNotification({ userId: '', type: 'system', sourceKey: 'k' }), 500);
    await rejects(notificationService.createNotification({ userId: 'me', type: 'system', sourceKey: '' }), 500);
});

test('만들기: 동시 만들기에 져 유일 제약 걸리면 잠금 읽기로 있던 것 돌려줌', async (t) => {
    const existing = row({ source_key: 'k' });
    const { db } = setup(t, [existing], { findOrCreate: async () => { throw uniqueError({ user_id: 'me', source_key: 'k' }); } });
    const res = await notificationService.createNotification({ userId: 'me', type: 'system', sourceKey: 'k', title: 't', body: 'b' }, { transaction: { LOCK: { SHARE: 'SHARE' } } });
    assert.equal(res.created, false);
    assert.equal(res.notification.id, ID);
    assert.deepEqual(db.calls.at(-1), ['findOne', 'SHARE']);
});

test('만들기: 다른 유일 제약 오류는 그대로 던짐', async (t) => {
    setup(t, [], { findOrCreate: async () => { throw uniqueError({ email: 'x' }); } });
    await assert.rejects(notificationService.createNotification({ userId: 'me', type: 'system', sourceKey: 'k', title: 't', body: 'b' }), /dup/);
});

test('친구 신청 알림: 출처 키 friend-request:N:received, 닉네임 40자로 자름', async (t) => {
    setup(t);
    const res = await notificationService.createForFriendRequest({ receiverId: 'me', requestId: 7, requesterNickname: '가'.repeat(50) });
    assert.equal(res.notification.sourceKey, 'friend-request:7:received');
    assert.equal(res.notification.body, `${'가'.repeat(40)} 님이 친구 요청을 보냈습니다.`);
    assert.deepEqual(res.notification.target, { kind: 'friend-request', requestId: 7 });
});

test('친구 신청 알림: 요청 id 숫자 아니면 안 만듦', async (t) => {
    const { db } = setup(t);
    const res = await notificationService.createForFriendRequest({ receiverId: 'me', requestId: '7' });
    assert.deepEqual(res, { created: false, notification: null });
    assert.equal(db.rows.length, 0);
});

test('친구 신청 알림: 닉네임 비었으면 "알 수 없는 사용자"', async (t) => {
    setup(t);
    const res = await notificationService.createForFriendRequest({ receiverId: 'me', requestId: 1, requesterNickname: '   ' });
    assert.match(res.notification.body, /^알 수 없는 사용자 님이/);
});

test('게임 초대 알림: 출처 키 game-invite:id:received, 초대 id 없으면 안 만듦', async (t) => {
    setup(t);
    const res = await notificationService.createForGameInvite({ receiverId: 'me', inviteId: 'inv-9', senderNickname: '방장' });
    assert.equal(res.notification.sourceKey, 'game-invite:inv-9:received');
    assert.equal(res.notification.type, 'game-invite');
    assert.deepEqual(await notificationService.createForGameInvite({ receiverId: 'me', inviteId: '' }), { created: false, notification: null });
});

test('업적 알림: 출처 키 achievement:id:granted', async (t) => {
    setup(t);
    const res = await notificationService.createForAchievement({ userId: 'me', achievementId: 'first-win' });
    assert.equal(res.notification.sourceKey, 'achievement:first-win:granted');
});

test('환영 알림: 처음이면 만들고 효과음 붙여 전송, 두 번째는 전송 없음', async (t) => {
    const { emitted } = setup(t);
    const first = await notificationService.ensureSystemWelcome('me');
    const second = await notificationService.ensureSystemWelcome('me');
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].event, 'notification_created');
    assert.equal(emitted[0].payload.sfxEvent.kind, 'system-notification');
    assert.equal(emitted[0].payload.notification.sourceKey, notificationService.SYSTEM_WELCOME.sourceKey);
});

test('환영 알림: 계정 없으면 안 만듦', async (t) => {
    const { db } = setup(t);
    assert.deepEqual(await notificationService.ensureSystemWelcome(''), { created: false, notification: null });
    assert.equal(db.rows.length, 0);
});

// ── 전송 ──
test('전송: 시스템 아닌 알림엔 효과음 안 붙임', (t) => {
    const { emitted } = setup(t);
    notificationService.emitNotificationCreated('me', { id: 'n', type: 'friend-request' });
    assert.deepEqual(emitted[0].payload, { notification: { id: 'n', type: 'friend-request' } });
});

test('전송: 알림 없으면 안 보냄, 보내다 터져도 안 던짐', (t) => {
    notificationService.__internal.__setDepsForTests({ emitToUser: () => { throw new Error('x'); } });
    t.after(() => notificationService.__internal.__setDepsForTests(null));
    t.mock.method(console, 'error', () => {});
    assert.doesNotThrow(() => notificationService.emitNotificationCreated('me', null));
    assert.doesNotThrow(() => notificationService.emitNotificationCreated('me', { id: 'n', type: 'system' }));
});

// ── 목록·읽음·지우기 ──
test('목록: 내 알림만, 최근 것부터 최대 100개로 부름', async (t) => {
    const { db } = setup(t, [row({ id: 'a' }), row({ id: 'b', user_id: 'other' })]);
    const list = await notificationService.listForUser('me');
    assert.deepEqual(list.map((n) => n.id), ['a']);
    const [, limit, order] = db.calls.find((c) => c[0] === 'findAll');
    assert.equal(limit, 100);
    assert.deepEqual(order, [['created_at', 'DESC'], ['id', 'DESC']]);
});

test('목록: 계정 없으면 빈 목록 (DB 안 감)', async (t) => {
    const { db } = setup(t);
    assert.deepEqual(await notificationService.listForUser(undefined), []);
    assert.equal(db.calls.length, 0);
});

test('읽음: uuid 모양 아닌 id면 400', async (t) => {
    setup(t);
    await rejects(notificationService.markRead('me', 'not-a-uuid'), 400);
});

test('읽음: 남의 알림이면 404', async (t) => {
    setup(t, [row({ user_id: 'other' })]);
    await rejects(notificationService.markRead('me', ID), 404);
});

test('읽음: 안 읽은 알림이면 읽음 시각 넣고 바뀐 행 돌려줌', async (t) => {
    const rows = [row()];
    setup(t, rows);
    const res = await notificationService.markRead('me', ID);
    assert.deepEqual(res.readAt, NOW);
    assert.deepEqual(rows[0].read_at, NOW);
});

test('읽음: 이미 읽었으면 처음 읽은 시각 그대로', async (t) => {
    const first = new Date('2026-01-01T00:00:00Z');
    const rows = [row({ read_at: first })];
    setup(t, rows);
    const res = await notificationService.markRead('me', ID);
    assert.equal(res.readAt, first);
});

test('읽은 것 지우기: 읽은 알림만 지우고 지운 수', async (t) => {
    const rows = [row({ id: 'r1', read_at: NOW }), row({ id: 'u1' }), row({ id: 'x', user_id: 'other', read_at: NOW })];
    setup(t, rows);
    const res = await notificationService.deleteReadForUser('me');
    assert.deepEqual(res, { deletedCount: 1 });
    assert.deepEqual(rows.map((r) => r.id), ['u1', 'x']);
});

// 브라우저 시험 lobby #1 (2026-11-09): 지운 "알림 기능 안내"가 다시 접속할 때마다 새로 생기던 문제
test('읽은 것 지우기: 환영 알림은 지워도 다시 안 생김 (보낸 기록은 숨김 줄로 남김)', async (t) => {
    const rows = [];
    const { emitted } = setup(t, rows);
    const welcomeKey = 'system:notifications-available:v1';

    assert.equal((await notificationService.ensureSystemWelcome('me')).created, true);
    assert.equal(emitted.length, 1);
    await notificationService.markRead('me', ID);
    const res = await notificationService.deleteReadForUser('me');
    assert.deepEqual(res, { deletedCount: 1 });
    assert.deepEqual(await notificationService.listForUser('me'), []);

    // 다시 접속 (알림 준비) → 새로 안 만들고 소리도 안 남
    assert.equal((await notificationService.ensureSystemWelcome('me')).created, false);
    assert.equal(emitted.length, 1);
    assert.deepEqual(await notificationService.listForUser('me'), []);
    assert.equal(rows.filter((r) => r.source_key === welcomeKey).length, 1);

    // 한 번 더 지워도 숨김 줄은 그대로 (세지도 않음)
    assert.deepEqual(await notificationService.deleteReadForUser('me'), { deletedCount: 0 });
    assert.equal(rows.filter((r) => r.source_key === welcomeKey).length, 1);
});

test('읽은 것 지우기: 계정 없으면 500', async (t) => {
    setup(t);
    await rejects(notificationService.deleteReadForUser(''), 500);
});

// ── 저장소 순수 부분 ──
test('저장소 중복 판정: 제약 이름 notifications_user_source_unique면 같은 알림', () => {
    const error = uniqueError({});
    error.parent = { constraint: 'notifications_user_source_unique' };
    assert.equal(notificationRepository.isDuplicateSourceError(error, {}, 'me', 'k'), true);
});

test('저장소 중복 판정: 유일 오류 아니면 false', () => {
    assert.equal(notificationRepository.isDuplicateSourceError(new Error('x'), {}, 'me', 'k'), false);
});

test('저장소 중복 판정: 칸 값이 다른 사람·다른 키면 false', () => {
    assert.equal(notificationRepository.isDuplicateSourceError(uniqueError({ user_id: 'you', source_key: 'k' }), {}, 'me', 'k'), false);
});

test('모양 바꾸기: 행 없으면 null, 모델 행이면 plain으로 풂', () => {
    assert.equal(notificationService.toPublicNotification(null), null);
    const model = { get: () => row({ target: { kind: 'settings' } }) };
    assert.deepEqual(notificationService.toPublicNotification(model).target, { kind: 'settings' });
});

// ── 컨트롤러 ──
const call = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        headers: {},
        set(k, v) { this.headers[k] = v; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body, headers: this.headers }); return this; },
    };
    Promise.resolve(handler({ user: { uuid: 'me' }, params: {}, ...req }, res, (error) => resolve({ error })));
});

test('컨트롤러 목록: 200·캐시 금지·data', async (t) => {
    t.mock.method(notificationService, 'listForUser', async () => [{ id: 'a' }]);
    const out = await call(notificationController.getNotifications, {});
    assert.equal(out.status, 200);
    assert.equal(out.headers['Cache-Control'], 'no-store');
    assert.deepEqual(out.body, { success: true, data: [{ id: 'a' }] });
});

test('컨트롤러 읽음: 경로의 id를 서비스에 넘김, 오류는 next', async (t) => {
    const boom = Object.assign(new Error('x'), { status: 404 });
    const mark = t.mock.method(notificationService, 'markRead', async () => { throw boom; });
    const out = await call(notificationController.markNotificationRead, { params: { id: ID } });
    assert.deepEqual(mark.mock.calls[0].arguments, ['me', ID]);
    assert.equal(out.error, boom);
});

test('컨트롤러 지우기: deletedCount 그대로', async (t) => {
    t.mock.method(notificationService, 'deleteReadForUser', async () => ({ deletedCount: 3 }));
    const out = await call(notificationController.deleteReadNotifications, {});
    assert.deepEqual(out.body.data, { deletedCount: 3 });
});
