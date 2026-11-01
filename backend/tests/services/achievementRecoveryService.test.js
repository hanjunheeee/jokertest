'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const achievementRecoveryService = require('../../services/achievement/recovery');

const { __internal } = achievementRecoveryService;

test.afterEach(() => {
    __internal.__setDepsForTests(null);
});

const createFakeUserDb = (uuids) => ({
    User: {
        async findAll() {
            return uuids.map((uuid) => ({ uuid }));
        },
    },
});

test('evaluateAllUsers는 존재하는 모든 계정을 evaluateAndGrantForUser로 평가한다', async () => {
    const db = createFakeUserDb(['user-a', 'user-b', 'user-c']);
    const calledWith = [];
    const achievementService = {
        async evaluateAndGrantForUser(userId) {
            calledWith.push(userId);
            return [];
        },
    };
    __internal.__setDepsForTests({ db, achievementService });

    const summary = await achievementRecoveryService.evaluateAllUsers();

    assert.deepEqual(calledWith, ['user-a', 'user-b', 'user-c']);
    assert.equal(summary.usersProcessed, 3);
    assert.deepEqual(summary.grants, []);
    assert.deepEqual(summary.errors, []);
});

test('신규로 지급된 업적이 있는 계정만 summary.grants에 담긴다', async () => {
    const db = createFakeUserDb(['user-a', 'user-b']);
    const achievementService = {
        async evaluateAndGrantForUser(userId) {
            if (userId === 'user-a') {
                return [
                    { id: 'record-1-masquerade', achieved: true, granted: true },
                    { id: 'record-2-extra-mask', achieved: false, granted: false },
                ];
            }
            return [{ id: 'record-1-masquerade', achieved: true, granted: false }];
        },
    };
    __internal.__setDepsForTests({ db, achievementService });

    const summary = await achievementRecoveryService.evaluateAllUsers();

    assert.deepEqual(summary.grants, [{ userId: 'user-a', achievementIds: ['record-1-masquerade'] }]);
    assert.equal(summary.usersProcessed, 2);
});

test('A-07: 한 계정의 평가 실패가 나머지 계정 처리를 막지 않는다', async () => {
    const db = createFakeUserDb(['user-a', 'user-broken', 'user-c']);
    const processed = [];
    const achievementService = {
        async evaluateAndGrantForUser(userId) {
            if (userId === 'user-broken') throw new Error('simulated evaluation failure');
            processed.push(userId);
            return [];
        },
    };
    __internal.__setDepsForTests({ db, achievementService });

    const summary = await achievementRecoveryService.evaluateAllUsers();

    assert.deepEqual(processed, ['user-a', 'user-c']);
    assert.equal(summary.usersProcessed, 2);
    assert.deepEqual(summary.errors, [{ userId: 'user-broken', message: 'simulated evaluation failure' }]);
});

test('A-07: 재실행해도 실패했던 계정이 다음 실행 대상에서 계속 포함된다(완료 표시를 남기지 않는다)', async () => {
    const db = createFakeUserDb(['user-broken']);
    let attempt = 0;
    const achievementService = {
        async evaluateAndGrantForUser(userId) {
            attempt += 1;
            if (attempt === 1) throw new Error('first attempt fails');
            return [{ id: 'record-1-masquerade', achieved: true, granted: true }];
        },
    };
    __internal.__setDepsForTests({ db, achievementService });

    const first = await achievementRecoveryService.evaluateAllUsers();
    assert.equal(first.errors.length, 1);

    const second = await achievementRecoveryService.evaluateAllUsers();
    assert.deepEqual(second.errors, []);
    assert.deepEqual(second.grants, [{ userId: 'user-broken', achievementIds: ['record-1-masquerade'] }]);
});
