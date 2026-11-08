'use strict';

// 알림 버그 수정 시험 파일, 동시 만들기 충돌 뒤 최신 값 읽기 · 목록 개수 상한
// 가짜 db를 __setDepsForTests로 넣어 DB 없이 돎
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@127.0.0.1:1/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const notificationService = require('../../../services/notification');

const uniqueError = () => Object.assign(new Error('dup'), {
    name: 'SequelizeUniqueConstraintError',
    fields: { notifications_user_source_unique: 'x' },
});

test('동시 만들기 충돌 뒤 다시 읽기는 잠금 읽기(최신 커밋 값)로 함', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    let readOptions = null;
    const existing = { id: 'n1', type: 'friend-request', source_key: 'k', title: 't', body: 'b', target: null, created_at: new Date(0), read_at: null };
    const db = {
        Notification: {
            findOrCreate: async () => { throw uniqueError(); },
            // 잠금 없는 스냅샷 읽기면 null (REPEATABLE READ 흉내)
            findOne: async (options) => { readOptions = options; return options.lock ? existing : null; },
        },
    };
    notificationService.__internal.__setDepsForTests({ db, newId: () => 'n2', now: () => new Date(0) });
    t.after(() => notificationService.__internal.__setDepsForTests(null));

    const result = await notificationService.createNotification(
        { userId: 'me', type: 'friend-request', sourceKey: 'k', title: 't', body: 'b' },
        { transaction },
    );

    assert.equal(readOptions.lock, 'SHARE');
    assert.equal(readOptions.transaction, transaction);
    assert.equal(result.created, false);
    assert.equal(result.notification?.id, 'n1');
});

test('BE-060: 알림 목록은 최근 100개까지만 읽음 (응답 모양 그대로)', async (t) => {
    let seen = null;
    const db = {
        Notification: {
            findAll: async (options) => { seen = options; return [{ id: 'n1', type: 'system', source_key: 's', title: 't', body: 'b', target: null, created_at: new Date(0), read_at: null }]; },
        },
    };
    notificationService.__internal.__setDepsForTests({ db });
    t.after(() => notificationService.__internal.__setDepsForTests(null));

    const list = await notificationService.listForUser('me');

    assert.equal(seen.limit, 100);
    assert.deepEqual(seen.order, [['created_at', 'DESC'], ['id', 'DESC']]);
    assert.deepEqual(Object.keys(list[0]).sort(), ['body', 'createdAt', 'id', 'readAt', 'sourceKey', 'target', 'title', 'type']);
});
