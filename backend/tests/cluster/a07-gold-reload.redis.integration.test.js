'use strict';

// 판 골드 값 서버 여러 대 시험: 이 프로세스 = 서버 ㄱ(관리자 경로 있음), 따로 띄운 Node 프로세스 = 서버 ㄴ, 진짜 Redis·시험 DB로 값 맞추기·지급 한 번을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-B-295~299 (돌리기: with-lock.sh testdb + redis, 시험_도우미.md 3-3·3-4)
// 같은 파일을 A07_GOLD_CHILD=1로 띄우면 서버 ㄴ 노릇만 함 (시험은 안 만듦)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const IS_CHILD = process.env.A07_GOLD_CHILD === '1';
// 하트비트 짧게 (ㄴ이 ㄱ 목록에 빨리 보이게)
const FAST_ENV = { CLUSTER_HEARTBEAT_MS: '200', NODE_DEAD_AFTER_MS: '4000' };

if (IS_CHILD) runChild(); else defineTests();

// ── 서버 ㄴ: 서버 켤 때처럼 cluster 켜고 판 설정 값 한 번 읽음, 부모 프로세스가 묻는 것에 답함 ──
function runChild() {
    const handlers = {};
    // 60초 안전망 시계를 가짜로: 판 설정 값 불러올 때 걸리는 반복 타이머만 잡아 둠 → 'advance'로 시간 넘김
    const captured = [];
    let elapsed = 0;

    async function boot() {
        require('../../models');
        const cluster = require('../../cluster');
        const { quietLog } = require('../../cluster/testing/memoryCluster');
        await cluster.init({
            env: { REDIS_URL: process.env.A07_REDIS_URL, SERVER_ID: process.env.A07_SERVER_ID, REDIS_KEY_PREFIX: process.env.A07_PREFIX, ...FAST_ENV },
            log: quietLog,
        });
        const realSetInterval = global.setInterval;
        global.setInterval = (fn, ms, ...rest) => {
            captured.push({ fn, ms });
            return { unref() {}, ref() {}, hasRef: () => false };
        };
        const gameSettings = require('../../services/ops/gameSettings');
        global.setInterval = realSetInterval;
        // 서버 켤 때 한 번 읽기 (backend/index.js와 같은 자리)
        await gameSettings.reloadGameSettings().catch(() => {});
        const economyGrants = require('../../services/economy/grants');

        handlers.value = () => gameSettings.getGameSettingsState().goldReward;
        handlers.intervals = () => captured.map((c) => c.ms);
        handlers.advance = ({ ms }) => {
            const before = elapsed;
            elapsed += ms;
            for (const c of captured) {
                const due = Math.floor(elapsed / c.ms) - Math.floor(before / c.ms);
                for (let i = 0; i < due; i += 1) c.fn();
            }
            return elapsed;
        };
        handlers.grant = async (grant) => {
            await economyGrants.grantGameRewards(grant);
            return true;
        };
        handlers.startGame = () => playRoomGameOnThisServer();
        handlers.exit = async () => {
            await cluster.close().catch(() => {});
            setImmediate(() => process.exit(0));
            return true;
        };
    }

    process.on('message', async (msg) => {
        try {
            const value = await handlers[msg.cmd](msg.args ?? {});
            process.send({ id: msg.id, ok: true, value });
        } catch (error) {
            process.send({ id: msg.id, ok: false, error: String(error?.message ?? error) });
        }
    });
    boot().then(
        () => process.send({ type: 'ready' }),
        (error) => {
            process.send({ type: 'boot-failed', error: String(error?.message ?? error) });
            process.exit(1);
        },
    );
}

// 이 서버에서 방 만들기 → 5명 입장·준비 → 방장 시작 → 밤마다 시민 암살로 광대 승 → 판 끝 칸 사람마다 goldReward 목록
// 판 기록·지급은 가짜 (가짜 계정이라 DB에 안 씀, 이 시험은 판 값만 봄)
async function playRoomGameOnThisServer() {
    const gf = require('../audit-2026-11-09/gameFixtures');
    process.env.DATABASE_URL = TEST_DB_URL;
    const gs = require('../../socket/gameSession');
    const matchmaking = require('../../socket/matchmaking');
    const mf = require('../helpers/matchmakingFixtures');
    const persistModule = require('../../services/game/record/persist');
    const { getSessionById } = require('../../game-core/queries/byId');
    const T = gs.__testables;
    const M = matchmaking.__testables;
    const realRandom = Math.random;
    Math.random = () => 0;
    try {
        mf.installFakeMatchmakingDeps(matchmaking);
        T.__setGameResultPersistForTests(async () => {});
        persistModule.__setGameGoldGrantForTests(async () => {});
        T.__setEvaluateAchievementsForTests(async () => {});
        const io = mf.createFakeIo([]);
        const registry = new Map();
        matchmaking.setOnlineUsersRegistry(registry);
        gs.setOnlineUsersRegistry(registry);
        const uuids = Array.from({ length: 5 }, (_, i) => `a07n2-${process.pid}-${Date.now().toString(36)}-${i}`);
        const sockets = new Map(uuids.map((u) => [u, mf.createFakeSocket(u)]));
        for (const [u, sk] of sockets) {
            io.sockets.sockets.set(sk.id, sk);
            registry.set(u, sk.id);
        }
        const [host, ...guests] = uuids;
        const created = await mf.callAsPromise(M.handleCreateRoom, io, sockets.get(host), host,
            mf.validSettingsPayload({ maxPlayers: 5, jokerCount: 1, accessType: 'code' }));
        if (!created.ok) throw new Error(`방 만들기 실패: ${created.code}`);
        for (const g of guests) await M.handleJoinRoomByCode(io, sockets.get(g), g, created.room.roomCode);
        for (const u of uuids) {
            const r = await mf.callAsPromise(M.handleSetReady, io, sockets.get(u), u, mf.readyPayload(created.room));
            if (!r.ok) throw new Error(`준비 실패: ${r.code}`);
        }
        const started = await mf.callAsPromise(M.handleStartGame, io, sockets.get(host), host, mf.startPayload(created.room));
        if (!started.ok) throw new Error(`시작 실패: ${started.code}`);
        const s = getSessionById(started.gameId);
        T.stopRoleRevealTimer(s.id);
        gf.toDay(s);
        for (let i = 0; i < 6 && s.phase !== 'ENDED'; i += 1) {
            T.stopNightTurnSequence(s.id);
            T.stopDayPhaseTimer(s.id);
            gf.toNight(s);
            const joker = gf.firstOf(s, 'JOKER');
            const victim = [...s.players.values()].find((p) => p.alive && p.role !== 'JOKER').uuid;
            if (!gf.core.submitNightAction(joker, s.id, victim).ok) throw new Error('밤 행동 거절');
            gf.skipAllNight(s);
            if (!T.finalizeNightForSession(io, s).ok) throw new Error('밤 마무리 실패');
        }
        const ended = sockets.get(gf.firstOf(s, 'JOKER')).received.find((e) => e.event === 'night_result_applied' && e.payload?.winResult);
        if (!ended) throw new Error('판 끝 칸이 실린 밤 결과 알림 없음');
        return ended.payload.winResult.reveals.map((r) => r.goldReward);
    } finally {
        Math.random = realRandom;
        require('../../socket/gameSession').__resetStateForTests();
        require('../../socket/matchmaking').__resetStateForTests();
    }
}

// ── 서버 ㄱ (시험 본체) ──
function defineTests() {
    const test = require('node:test');
    const assert = require('node:assert/strict');
    const crypto = require('node:crypto');
    const { fork } = require('node:child_process');

    const db = require('../../models');
    const { prepareAdminDb, adminTestApp } = require('../admin/helpers/adminTestApp');
    const { REDIS_URL_TEST, uniquePrefix, waitFor, cleanupPrefix } = require('./helpers/redisNodes');
    const { createRedisProxy } = require('./helpers/redisProxy');
    const cluster = require('../../cluster');
    const { quietLog } = require('../../cluster/testing/memoryCluster');
    const gameSettings = require('../../services/ops/gameSettings');
    const reloadSync = require('../../services/ops/reloadSync');
    const economyGrants = require('../../services/economy/grants');
    const money = require('../admin/helpers/money');

    const KEY = 'GAME_GOLD_REWARD';
    const PATH = '/admin-api/game-settings';
    const prefix = uniquePrefix();
    const SERVER_A = `a07g1-${crypto.randomUUID().slice(0, 6)}`;

    // 시험 DB·시험 Redis 둘 다 있어야 돎 (없으면 건너뜀)
    const missing = (t) => {
        if (TEST_DB_URL && REDIS_URL_TEST) return false;
        t.skip('F01_TEST_DATABASE_URL·REDIS_URL_TEST 둘 다 있어야 함 — with-lock.sh testdb·redis로 돌림');
        return true;
    };

    let prepared = null;
    let app = null;
    test.before(async () => {
        if (!TEST_DB_URL || !REDIS_URL_TEST) return;
        prepared = await prepareAdminDb();
        await cluster.init({ env: { REDIS_URL: REDIS_URL_TEST, SERVER_ID: SERVER_A, REDIS_KEY_PREFIX: prefix, ...FAST_ENV }, log: quietLog });
        app = await adminTestApp();
    });

    test.after(async () => {
        if (app) await app.close();
        reloadSync.__testables.stopSafetyNet();
        await cluster.close().catch(() => {});
        await cleanupPrefix(prefix).catch(() => {});
        if (prepared) await prepared.close();
    });

    // ── 이 파일 안 작은 도우미 (공용 도우미는 안 고침) ──

    // 서버 ㄴ 띄우기 (redisUrl을 주면 그 길로 Redis에 붙음, 멈춤 흉내용) → { id, ask(cmd, args), stop() }
    async function startServerB(t, { redisUrl = REDIS_URL_TEST } = {}) {
        const id = `a07g2-${crypto.randomUUID().slice(0, 6)}`;
        const child = fork(__filename, [], {
            env: { ...process.env, A07_GOLD_CHILD: '1', A07_REDIS_URL: redisUrl, A07_SERVER_ID: id, A07_PREFIX: prefix },
            execArgv: [],
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        });
        const waiting = new Map();
        let seq = 0;
        child.on('message', (msg) => {
            if (msg?.id && waiting.has(msg.id)) {
                const { resolve, reject } = waiting.get(msg.id);
                waiting.delete(msg.id);
                if (msg.ok) resolve(msg.value); else reject(new Error(msg.error));
            }
        });
        const exited = new Promise((resolve) => child.once('exit', resolve));
        // 서버 ㄴ 켜짐 기다림 (끝은 Promise.race로, 맨몸 기다림 안 씀)
        const ready = new Promise((resolve, reject) => {
            child.on('message', (msg) => {
                if (msg?.type === 'ready') resolve();
                if (msg?.type === 'boot-failed') reject(new Error(`서버 ㄴ 켜기 실패: ${msg.error}`));
            });
        });
        const limit = (ms, label) => new Promise((_, reject) => { setTimeout(() => reject(new Error(`${label} 시간 넘김`)), ms).unref(); });
        await Promise.race([ready, exited.then(() => { throw new Error('서버 ㄴ이 켜지기 전에 꺼짐'); }), limit(20_000, '서버 ㄴ 켜기')]);
        const ask = (cmd, args) => Promise.race([
            new Promise((resolve, reject) => {
                seq += 1;
                const msgId = `${id}-${seq}`;
                waiting.set(msgId, { resolve, reject });
                child.send({ id: msgId, cmd, args });
            }),
            limit(20_000, `서버 ㄴ ${cmd}`),
        ]);
        let stopped = false;
        const stop = async () => {
            if (stopped) return;
            stopped = true;
            await ask('exit').catch(() => {});
            await Promise.race([exited, new Promise((resolve) => { setTimeout(resolve, 3_000).unref(); })]);
            if (child.exitCode === null) child.kill();
        };
        t.after(stop);
        // 서버 ㄱ 목록에 ㄴ이 보일 때까지
        await waitFor(async () => {
            await cluster.nodes.refresh();
            return cluster.nodes.list().some((n) => n.id === id);
        });
        return { id, ask, stop };
    }

    // 시험마다 시작 값: 표·서버 ㄱ 값 둘 다 value
    async function freshStart(t, value = 1) {
        const [row] = await db.GameSetting.findOrCreate({ where: { key: KEY }, defaults: { key: KEY, value_int: value } });
        await row.update({ value_int: value });
        gameSettings.__setGoldRewardForTests(value);
        t.after(() => gameSettings.__setGoldRewardForTests());
    }

    const put = (goldReward) => app.agent.request('PUT', PATH, { body: { goldReward } });

    // ── A07-B-295~299 ──

    test('A07-B-295 서버 ㄱ에서 관리자가 2로 → 서버 ㄴ 메모리 값 2, ㄴ에서 시작한 판(5명) goldReward 2', { timeout: 60_000 }, async (t) => {
        if (missing(t)) return;
        await freshStart(t, 1);
        const b = await startServerB(t);
        assert.equal(await b.ask('value'), 1);
        const res = await put(2);
        assert.equal(res.status, 200);
        assert.equal(await b.ask('value'), 2);
        const gold = await b.ask('startGame');
        assert.deepEqual(gold, [2, 2, 2, 2, 2]);
    });

    test('A07-B-296 서버 ㄴ 꺼진 채 3으로 바꿈 → ㄴ 켬 → ㄴ 값 3', { timeout: 60_000 }, async (t) => {
        if (missing(t)) return;
        await freshStart(t, 1);
        assert.equal((await put(3)).status, 200);
        const b = await startServerB(t);
        assert.equal(await b.ask('value'), 3);
    });

    test('A07-B-297 다시 읽기 알림을 놓쳐도 60초 안전망 뒤 ㄴ 값 = 표 값 (가짜 시계)', { timeout: 60_000 }, async (t) => {
        if (missing(t)) return;
        await freshStart(t, 1);
        const b = await startServerB(t);
        assert.equal(await b.ask('value'), 1);
        // 알림 없이 표만 바뀜 (ㄴ이 다시 읽기 알림을 못 받은 것과 같음)
        const row = await db.GameSetting.findOne({ where: { key: KEY } });
        await row.update({ value_int: 4 });
        await b.ask('advance', { ms: 59_999 });
        assert.equal(await b.ask('value'), 1, '60초 전엔 아직 옛 값');
        await b.ask('advance', { ms: 1 });
        await waitFor(async () => (await b.ask('value')) === 4);
        assert.equal(await b.ask('value'), 4);
    });

    test('A07-B-298 같은 판 지급을 ㄱ·ㄴ에서 한꺼번에 → 사람마다 장부 1줄', { timeout: 60_000 }, async (t) => {
        if (missing(t)) return;
        await freshStart(t, 1);
        const b = await startServerB(t);
        const users = [];
        for (let i = 0; i < 5; i += 1) users.push((await money.createMember('a07c')).uuid);
        const grant = { userIds: users, amount: 1, referenceEventId: `game-reward:${crypto.randomUUID()}` };
        await Promise.allSettled([economyGrants.grantGameRewards(grant), b.ask('grant', grant)]);
        for (const u of users) {
            const rows = await db.EconomyLedgerEntry.findAll({ where: { user_id: u, reference_event_id: grant.referenceEventId }, raw: true });
            assert.equal(rows.length, 1, `${u} 장부 줄 수`);
            assert.equal((await money.walletOf(u)).gold, 1);
        }
    });

    test('A07-B-299 ㄴ 멈춤 중 바꿈 → 응답 partial true, ㄱ은 새 값', { timeout: 60_000 }, async (t) => {
        if (missing(t)) return;
        await freshStart(t, 1);
        const { port } = new URL(REDIS_URL_TEST);
        const proxy = await createRedisProxy({ targetPort: Number(port) });
        t.after(() => proxy.close());
        const b = await startServerB(t, { redisUrl: proxy.url });
        assert.equal(await b.ask('value'), 1);
        proxy.freeze();
        const res = await put(5);
        assert.equal(res.status, 200);
        assert.equal(res.body.partial, true);
        const nodeB = res.body.nodes.find((n) => n.node === b.id);
        assert.equal(nodeB?.ok, false, '멈춘 ㄴ은 반영 못 함');
        assert.equal((await app.agent.get(PATH)).body.node.goldReward, 5);
        proxy.restore();
    });
}
