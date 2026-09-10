'use strict';

// F-12 achievementRecoveryService.js 단위 시험. A-07(새 경기·페이지 방문 없이 과거·신규
// 지급 누락을 재처리)의 순회·오류 격리·요약 집계를 실제 MySQL 없이 fake db/
// achievementService로 검증한다. achievementService.evaluateAndGrantForUser 자체의
// 원자성·멱등성은 achievementService.test.js가 이미 검증하므로, 여기서는 이 서비스가
// "누구를 평가할지"와 "한 계정의 실패가 나머지를 막지 않는지"만 확인한다.

const test = require('node:test');
const assert = require('node:assert/strict');

const achievementRecoveryService = require('./achievementRecoveryService');

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
            // user-b: 이미 예전에 지급됐던 업적 — 이번 호출에서는 granted:false.
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
