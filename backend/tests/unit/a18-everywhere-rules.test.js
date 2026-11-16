'use strict';

// 어디서나 같은 판 규칙 시험 — 개발·시험·운영·값 없음 모두 5~10명, 정원 5~10, 광대 0명 판 없음, 옛 개발 값(GAME_DEV_MIN_PLAYERS) 안 통함
// 목록 A18-B-001~014 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-everywhere-rules.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..', '..');

// 환경값 바꾼 채 저장소 모듈 새로 읽기 (읽을 때 환경값 보는 코드도 잡으려고), 값이 undefined면 그 칸 지움, 끝나면 되돌림
function withEnv(env, fn) {
    const saved = {};
    for (const key of Object.keys(env)) saved[key] = process.env[key];
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(BACKEND) && !key.includes('node_modules')) delete require.cache[key];
    }
    try {
        for (const [key, value] of Object.entries(env)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        return fn((rel) => require(path.join(BACKEND, rel)));
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

// n명 방 (광대 수 따로), 판 만들기에 넣는 모양
function makeRoom(id, n, jokerCount) {
    const players = Array.from({ length: n }, (_, i) => ({ uuid: `${id}-${i}`, nickname: `닉${i}`, isReady: true }));
    return { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount } };
}

// 방 만들기 요청 값 (칸 하나씩 바꿔 씀)
const createPayload = (overrides = {}) => ({
    accessType: 'open', maxPlayers: 10, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60, ...overrides,
});

// ── 001~004: 네 환경 모두 같은 인원 규칙 (옛 개발 값 1도 넣어 봄) ──
[
    ['001', 'production'],
    ['002', 'development'],
    ['003', 'test'],
    ['004', undefined],
].forEach(([no, nodeEnv]) => {
    test(`A18-B-${no} NODE_ENV=${nodeEnv ?? '없음'} + GAME_DEV_MIN_PLAYERS=1 → 시작 5·판 최소 5·정원 최소 5·방 크기 [10,8,6,5]`, () => {
        withEnv({ NODE_ENV: nodeEnv, GAME_DEV_MIN_PLAYERS: '1' }, (load) => {
            const config = load('socket/matchmaking/core/config');
            const setup = load('game-core/setup/constants');
            assert.equal(config.getRequiredPlayers(), 5);
            assert.equal(setup.getMinSupportedPlayers(), 5);
            assert.equal(setup.getMinRoomCapacity(), 5);
            assert.deepEqual(config.getSupportedRoomSizes(), [10, 8, 6, 5]);
        });
    });
});

// ── 005~008: 개발에서도 정원 5~10만 ──
[
    ['005', 4, false],
    ['006', 5, true],
    ['007', 10, true],
    ['008', 11, false],
].forEach(([no, maxPlayers, allowed]) => {
    test(`A18-B-${no} 개발 환경 방 정원 ${maxPlayers} → ${allowed ? '허용' : '거절'}`, () => {
        withEnv({ NODE_ENV: 'development' }, (load) => {
            const { validateCreateRoomPayload } = load('validations/room/create');
            const r = validateCreateRoomPayload(createPayload({ maxPlayers }));
            assert.equal(r.ok, allowed, r.message);
        });
    });
});

// ── 009~012: 개발에서도 판은 5~10명 ──
[
    ['009', 4, false],
    ['010', 5, true],
    ['011', 10, true],
    ['012', 11, false],
].forEach(([no, n, allowed]) => {
    test(`A18-B-${no} 개발 환경 ${n}명(광대 1) 판 만들기 → ${allowed ? '됨' : 'INVALID_SESSION_INPUT·PLAYER_COUNT_OUT_OF_RANGE'}`, () => {
        withEnv({ NODE_ENV: 'development' }, (load) => {
            const { buildSessionCandidate } = load('game-core/gameSession').__testables;
            const r = buildSessionCandidate(makeRoom(`b${no}`, n, 1), { randomFn: () => 0 });
            if (allowed) {
                assert.equal(r.ok, true, `${r.code} ${r.reason}`);
                assert.equal(r.session.players.size, n);
            } else {
                assert.equal(r.ok, false);
                assert.equal(r.code, 'INVALID_SESSION_INPUT');
                assert.equal(r.reason, 'PLAYER_COUNT_OUT_OF_RANGE');
            }
        });
    });
});

// ── 013~014: 광대 0명 판 없음 ──
test('A18-B-013 개발 환경 6명 판 만들기 광대 0 → INVALID_JOKER_COUNT', () => {
    withEnv({ NODE_ENV: 'development' }, (load) => {
        const { buildSessionCandidate } = load('game-core/gameSession').__testables;
        const r = buildSessionCandidate(makeRoom('b013', 6, 0), { randomFn: () => 0 });
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'INVALID_JOKER_COUNT');
    });
});

test('A18-B-014 개발 환경 방 만들기 설정 광대 0 → 거절', () => {
    withEnv({ NODE_ENV: 'development' }, (load) => {
        const { validateCreateRoomPayload } = load('validations/room/create');
        const r = validateCreateRoomPayload(createPayload({ jokerCount: 0 }));
        assert.equal(r.ok, false);
    });
});
