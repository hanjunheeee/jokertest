'use strict';

// 브라우저 시험 역할 미리 정하기 시험 파일, 방·사람 예약이 서로 안 섞이는지 + 사슬 바꿈까지 맞추는지 (문제목록 mobile M-5·ingame-b)
const test = require('node:test');
const assert = require('node:assert/strict');

const gameHooks = require('../../socket/e2e/gameHooks');

const ROLES = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'];
const sessionOf = (id, roomId, roles) => ({
    id,
    roomId,
    players: new Map(roles.map((role, i) => [`${id}-u${i}`, { uuid: `${id}-u${i}`, role }])),
});
const roleOf = (session, uuid) => session.players.get(uuid).role;
const sortedRoles = (session) => [...session.players.values()].map((p) => p.role).sort();

function withHooksOn(fn) {
    const saved = { NODE_ENV: process.env.NODE_ENV, E2E_HOOKS: process.env.E2E_HOOKS };
    process.env.NODE_ENV = 'test';
    process.env.E2E_HOOKS = '1';
    gameHooks.clearRolePresets();
    try {
        fn();
    } finally {
        gameHooks.clearRolePresets();
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
}

test('사슬 바꿈: 나(의사)→경비원, 봇0(경비원)→광대 이면 둘 다 맞고 광대였던 사람이 남은 의사', () => {
    withHooksOn(() => {
        // u0 의사(나), u1 경비원(봇0), u2 광대, u3 마녀사냥꾼, u4 시민
        const s = sessionOf('g1', 'r1', ['DOCTOR', 'GUARD', 'JOKER', 'WITCH_HUNTER', 'CITIZEN']);
        const before = sortedRoles(s);
        gameHooks.setRolePresets({ 'g1-u0': 'GUARD', 'g1-u1': 'JOKER' }, { roomId: 'r1' });
        assert.deepEqual(gameHooks.applyRolePresets(s), []);
        assert.equal(roleOf(s, 'g1-u0'), 'GUARD');
        assert.equal(roleOf(s, 'g1-u1'), 'JOKER');
        assert.equal(roleOf(s, 'g1-u2'), 'DOCTOR');
        // 바라지 않은 사람은 그대로
        assert.equal(roleOf(s, 'g1-u3'), 'WITCH_HUNTER');
        assert.equal(roleOf(s, 'g1-u4'), 'CITIZEN');
        assert.deepEqual(sortedRoles(s), before);
    });
});

test('세 명 돌려 바꾸기(가→나, 나→다, 다→가)와 다섯 역할 전부 지정도 맞춤', () => {
    withHooksOn(() => {
        const s = sessionOf('g2', 'r2', ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN']);
        gameHooks.setRolePresets({ 'g2-u0': 'DOCTOR', 'g2-u1': 'GUARD', 'g2-u2': 'JOKER' });
        assert.deepEqual(gameHooks.applyRolePresets(s), []);
        assert.deepEqual(['g2-u0', 'g2-u1', 'g2-u2', 'g2-u3'].map((u) => roleOf(s, u)), ['DOCTOR', 'GUARD', 'JOKER', 'CITIZEN']);

        const all = sessionOf('g3', 'r3', [...ROLES]);
        const want = { 'g3-u0': 'CITIZEN', 'g3-u1': 'WITCH_HUNTER', 'g3-u2': 'JOKER', 'g3-u3': 'DOCTOR', 'g3-u4': 'GUARD' };
        gameHooks.setRolePresets(want, { roomId: 'r3' });
        assert.deepEqual(gameHooks.applyRolePresets(all), []);
        for (const [uuid, role] of Object.entries(want)) assert.equal(roleOf(all, uuid), role);
    });
});

test('자리가 모자라면 이미 그 역할인 사람이 그대로 갖고 나머지만 못 맞춤', () => {
    withHooksOn(() => {
        const s = sessionOf('g4', 'r4', ['CITIZEN', 'JOKER', 'CITIZEN']);
        gameHooks.setRolePresets({ 'g4-u0': 'JOKER', 'g4-u1': 'JOKER' }, { roomId: 'r4' });
        assert.deepEqual(gameHooks.applyRolePresets(s), ['g4-u0']);
        assert.equal(roleOf(s, 'g4-u1'), 'JOKER');
        assert.equal(roleOf(s, 'g4-u0'), 'CITIZEN');
    });
});

test('방 예약은 그 방 판에만 쓰고, 남의 방·남의 사람 예약은 안 건드림', () => {
    withHooksOn(() => {
        const a = sessionOf('ga', 'room-a', ['CITIZEN', 'JOKER']);
        const b = sessionOf('gb', 'room-b', ['CITIZEN', 'JOKER']);
        gameHooks.setRolePresets({ 'ga-u0': 'JOKER' }, { roomId: 'room-a' });
        gameHooks.setRolePresets({ 'gb-u0': 'JOKER' }, { roomId: 'room-b' });
        // 다른 방 id로 같은 사람을 적어도 그 방 판에서만 씀
        gameHooks.setRolePresets({ 'ga-u1': 'JOKER' }, { roomId: 'room-zzz' });
        assert.deepEqual(gameHooks.pendingRolePresets(), { rooms: 3, users: 0 });

        gameHooks.applyRolePresets(a);
        assert.equal(roleOf(a, 'ga-u0'), 'JOKER');
        assert.deepEqual(gameHooks.pendingRolePresets(), { rooms: 2, users: 0 });

        // 사람 하나만 지우기: 남의 방 예약은 남음
        gameHooks.clearRolePresets(['someone-else']);
        gameHooks.applyRolePresets(b);
        assert.equal(roleOf(b, 'gb-u0'), 'JOKER');
        assert.deepEqual(gameHooks.pendingRolePresets(), { rooms: 1, users: 0 });

        gameHooks.clearRolePresets({ roomId: 'room-zzz' });
        assert.deepEqual(gameHooks.pendingRolePresets(), { rooms: 0, users: 0 });
    });
});

test('사람 예약(방 id 없음)은 그 사람이 든 판에서만 쓰고 지워짐, 방 예약이 먼저', () => {
    withHooksOn(() => {
        const s = sessionOf('gu', 'room-u', ['CITIZEN', 'JOKER', 'DOCTOR']);
        gameHooks.setRolePresets({ 'gu-u0': 'DOCTOR', 'other-user': 'JOKER' });
        gameHooks.setRolePresets({ 'gu-u0': 'JOKER' }, { roomId: 'room-u' });
        assert.deepEqual(gameHooks.applyRolePresets(s), []);
        assert.equal(roleOf(s, 'gu-u0'), 'JOKER');
        // 이 판 사람 예약은 쓰고 지워짐, 남의 사람 예약은 남음
        assert.deepEqual(gameHooks.pendingRolePresets(), { rooms: 0, users: 1 });
        assert.throws(() => gameHooks.setRolePresets({ x: 'JOKER' }, { roomId: 42 }));
    });
});
