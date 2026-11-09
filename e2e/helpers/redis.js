'use strict';

// 시험 Redis 도우미 파일, Node 여러 개 실행(E2E_NODES=2)에서 PING·이번 실행 앞머리 키 지우기·시험 Redis 컨테이너 켜기
// scripts/start-backend.js·global-setup·global-teardown이 씀, Redis 연결은 backend의 ioredis를 빌려 씀 (e2e엔 패키지 안 넣음)
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { E2E, BACKEND_DIR } = require('./env');

const Redis = () => require(path.join(BACKEND_DIR, 'node_modules', 'ioredis'));

// 짧게 쓰고 닫는 연결 (다시 붙기 안 함 → 죽어 있으면 바로 실패)
async function withRedis(fn, url = E2E.redisUrl) {
    const RedisClass = Redis();
    const client = new RedisClass(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null, connectTimeout: 3000 });
    client.on('error', () => { /* 아래 await가 실패로 받음 */ });
    try {
        await client.connect();
        return await fn(client);
    } finally {
        client.disconnect();
    }
}

/** PING → true/false (던지지 않음) */
async function ping(url = E2E.redisUrl) {
    try {
        return (await withRedis((c) => c.ping(), url)) === 'PONG';
    } catch {
        return false;
    }
}

/** 앞머리(prefix)로 시작하는 키 전부 지움 → 지운 수 (SCAN으로 조금씩, KEYS 안 씀) */
async function deletePrefix(prefix, url = E2E.redisUrl) {
    if (!/^e2e:[A-Za-z0-9_.:-]+$/.test(prefix)) throw new Error(`e2e 앞머리만 지움: ${prefix}`);
    return withRedis(async (c) => {
        let cursor = '0';
        let removed = 0;
        do {
            const [next, keys] = await c.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500);
            cursor = next;
            if (keys.length > 0) removed += await c.unlink(...keys);
        } while (cursor !== '0');
        return removed;
    }, url);
}

/**
 * 시험 Redis 켜기: E2E_REDIS_URL을 따로 줬으면 PING만, 아니면 backend/scripts/setup-test-redis.js(docker mmc-redis-test 6380)
 * 실패면 던짐 (Node 여러 개는 Redis 없이 뜻이 없음)
 */
async function ensureRedis() {
    if (!E2E.redisUrlGiven) {
        const result = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'setup-test-redis.js')], { encoding: 'utf8', windowsHide: true });
        if (result.status !== 0) throw new Error(`시험 Redis 못 켬: ${(result.stderr || result.stdout || '').trim().split('\n').pop()}`);
    }
    if (!(await ping())) throw new Error(`시험 Redis PING 실패 (${E2E.redisUrl}) — E2E_REDIS_URL 확인`);
}

module.exports = { ping, deletePrefix, ensureRedis, withRedis };
