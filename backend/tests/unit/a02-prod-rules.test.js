'use strict';

// 운영 규칙 하나 시험 — 개발·시험 환경도 최소 5명, 자동 매칭 방 크기 표, 옛 환경값·광대 0명은 안 통함
// 목록 A02-B-157~160 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "운영 규칙 하나", 단위 18)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..', '..');

// 환경값을 바꾼 채 모듈을 새로 읽음 (읽을 때 환경값을 보는 코드도 잡으려고), 끝나면 환경값 되돌림
function withEnv(env, fn) {
    const saved = {};
    for (const key of Object.keys(env)) saved[key] = process.env[key];
    // 저장소 코드만 새로 읽게 캐시에서 뺌 (설치된 꾸러미는 그대로)
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(BACKEND) && !key.includes('node_modules')) delete require.cache[key];
    }
    try {
        for (const [key, value] of Object.entries(env)) process.env[key] = value;
        return fn((rel) => require(path.join(BACKEND, rel)));
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

// 사람 n명 방 (광대 수 따로)
function makeRoom(id, n, jokerCount) {
    const players = Array.from({ length: n }, (_, i) => ({ uuid: `${id}-${i}`, nickname: `닉${id}${i}`, isReady: true }));
    return { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount } };
}

test('A02-B-157 NODE_ENV=development → 시작 필요 인원·판 최소 인원·정원 최소 모두 5', () => {
    withEnv({ NODE_ENV: 'development' }, (load) => {
        const config = load('socket/matchmaking/core/config');
        const setup = load('game-core/setup/constants');
        assert.equal(config.getRequiredPlayers(), 5);
        assert.equal(setup.getMinSupportedPlayers(), 5);
        assert.equal(setup.getMinRoomCapacity(), 5);
    });
});

test('A02-B-158 NODE_ENV=development → 방 크기 표 [10,8,6,5] (1·2명 방 없음)', () => {
    withEnv({ NODE_ENV: 'development' }, (load) => {
        assert.deepEqual(load('socket/matchmaking/core/config').getSupportedRoomSizes(), [10, 8, 6, 5]);
    });
});

test('A02-B-159 GAME_DEV_MIN_PLAYERS=1 + 4명으로 판 만들기 → 거절', () => {
    withEnv({ NODE_ENV: 'development', GAME_DEV_MIN_PLAYERS: '1' }, (load) => {
        const { buildSessionCandidate } = load('game-core/gameSession').__testables;
        const r = buildSessionCandidate(makeRoom('b159', 4, 1), { randomFn: () => 0 });
        assert.equal(r.ok, false);
    });
});

test('A02-B-160 NODE_ENV=test, 6명·광대 0으로 판 만들기 → 거절', () => {
    withEnv({ NODE_ENV: 'test' }, (load) => {
        const { buildSessionCandidate } = load('game-core/gameSession').__testables;
        const r = buildSessionCandidate(makeRoom('b160', 6, 0), { randomFn: () => 0 });
        assert.equal(r.ok, false);
    });
});
