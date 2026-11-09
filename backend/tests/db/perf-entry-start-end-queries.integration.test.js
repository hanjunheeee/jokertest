'use strict';

// 진짜 DB 시험: 판 입장·시작·끝 때 나가는 DB 질의 수·거래 수 세기 (부하시험.md 11-x 전후 표 근거)
// 방 만들기·공개방·코드·자동 입장·5/10명 시작·끝을 실제 처리기로 돌리고 sequelize 로그 줄을 셈, F01_TEST_DATABASE_URL 없으면 건너뜀
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
});

const db = require('../../models');
const economyService = require('../../services/economy');
const matchmaking = require('../../socket/matchmaking');
const handlers = matchmaking.__testables;
const { playerRoom } = require('../../socket/matchmaking/core/state');
const gameSessionCore = require('../../game-core/gameSession');
const { gameSessions } = require('../../game-core/core/registry/state');
const { finalizeGameSession } = require('../../game-core/core/rules/terminal');
const gameRecord = require('../../services/game/record');
const { flushPublicRoomList } = require('../../socket/matchmaking/room/view');
const {
    createFakeIo, createFakeSocket, validSettingsPayload, readyPayload, startPayload, callAsPromise,
} = require('../helpers/matchmakingFixtures');

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
    if (TEST_DB_URL) await db.sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 DB 없이는 못 셈 (미검증)');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB 연결 실패 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

// 질의 세기: sequelize 로그 줄 하나 = 질의 하나, START TRANSACTION 줄 = 거래 하나
const counter = { queries: 0, transactions: 0, lines: [] };
const countQuery = (message) => {
    counter.queries += 1;
    counter.lines.push(message);
    if (/START TRANSACTION/i.test(message)) counter.transactions += 1;
};
const startCounting = () => {
    counter.queries = 0;
    counter.transactions = 0;
    counter.lines = [];
    db.sequelize.options.logging = countQuery;
};
const stopCounting = () => {
    db.sequelize.options.logging = false;
    const counts = { queries: counter.queries, transactions: counter.transactions };
    // PERF_DUMP=1이면 센 질의 줄도 같이 들고 다님 (어디서 나가는지 볼 때)
    if (process.env.PERF_DUMP === '1') Object.defineProperty(counts, 'lines', { value: [...counter.lines] });
    return counts;
};

// 늦게 도는 DB 일까지 끝나길 기다림: 조건 맞고 질의 수가 잠깐 안 늘면 끝
const waitForQuiet = async (isDone = () => true, { quietMs = 150, timeoutMs = 15_000 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let lastCount = -1;
    let quietSince = Date.now();
    for (;;) {
        if (counter.queries !== lastCount) {
            lastCount = counter.queries;
            quietSince = Date.now();
        }
        if (isDone() && Date.now() - quietSince >= quietMs) return;
        if (Date.now() > deadline) throw new Error('DB 일이 기한 안에 안 끝남');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

// 가입과 같은 계정 상태: 계정·통계 행 + 기본 지급 (가입 거래 안에서 하던 것)
const createAccount = async (label) => {
    const uuid = crypto.randomUUID();
    await db.User.create({ uuid, password_hash: 'x', nickname: `${label}${uuid.slice(0, 5)}`, email: `${label}-${uuid}@example.com` });
    await db.UserStats.create({ user_id: uuid });
    await economyService.ensureDefaultEntitlements(uuid, db);
    return uuid;
};

// 처음 보는 사람 기억(입장 확인 생략용)을 비움 → 서버 막 켠 상태로 셈
const forgetCheckedAccounts = () => economyService.__internal.forgetDefaultChecks();

const connect = (io, uuid) => io.sockets.sockets.set(`sock-${uuid}`, createFakeSocket(uuid)).get(`sock-${uuid}`);

const roomSettings = (playerCount, accessType) => validSettingsPayload({
    accessType, maxPlayers: playerCount, jokerCount: playerCount >= 8 ? 2 : 1,
});

// 방 만들기 (답 올 때까지 센 것 = 방 만들기, 그 뒤 자동 입장까지 기다림)
const createRoom = async (io, socket, uuid, playerCount, accessType, autoJoinUuids = []) => {
    startCounting();
    let atCallback = null;
    const created = await new Promise((resolve) => {
        handlers.handleCreateRoom(io, socket, uuid, roomSettings(playerCount, accessType), (response) => {
            atCallback = { queries: counter.queries, transactions: counter.transactions };
            resolve(response);
        });
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    await waitForQuiet(() => autoJoinUuids.every((u) => playerRoom.get(u) === created.room.roomId));
    const total = stopCounting();
    return {
        room: created.room,
        create: atCallback,
        autoJoin: { queries: total.queries - atCallback.queries, transactions: total.transactions - atCallback.transactions },
    };
};

const measure = async (work) => {
    startCounting();
    await work();
    await waitForQuiet();
    return stopCounting();
};

const readyAll = async (io, sockets, uuids, room) => {
    for (const uuid of uuids) {
        const response = await callAsPromise(handlers.handleSetReady, io, sockets.get(uuid), uuid, readyPayload(room));
        assert.equal(response.ok, true, JSON.stringify(response));
    }
};

// 시작: 방장 시작 요청 하나 (프로필·외형·전적·팔레트 읽기)
const startGame = async (io, hostSocket, hostUuid, room) => {
    let gameId = null;
    const counts = await measure(async () => {
        const response = await callAsPromise(
            handlers.handleStartGame, io, hostSocket, hostUuid, startPayload(room),
        );
        assert.equal(response.ok, true, JSON.stringify(response));
        gameId = response.gameId;
    });
    return { gameId, counts };
};

// 끝: 시민 승으로 닫고 전적 저장 → 업적 평가가 끝나 경제·업적 무효화 신호가 다 갈 때까지
const endGame = async (gameId, uuids) => {
    const session = gameSessions.get(gameId);
    session.gameSource = 'production';
    for (const player of session.players.values()) {
        if (player.role === 'JOKER') {
            player.alive = false;
            player.deathReason = 'EXECUTION';
        }
    }
    finalizeGameSession(session, { winner: 'CITIZEN' });
    const signalled = new Set();
    gameRecord.setEmitToUser((uuid, event, payload) => {
        if (event === 'account_cache_invalidated' && payload.scopes.includes('achievements')) signalled.add(uuid);
    });
    const counts = await measure(async () => {
        gameRecord.persistTerminalSession(session, { completed: true });
        await waitForQuiet(() => uuids.every((u) => signalled.has(u)));
    });
    gameRecord.setEmitToUser(null);
    return counts;
};

const perPerson = (counts, people) => ({
    queries: counts.queries / people, transactions: counts.transactions / people,
});

// 한 사람 수(N)로 판 세 번: 1판(서버 막 켬·공개방·코드), 2판(자동 입장), 3판(다시 공개방·코드)
const runCycle = async (playerCount) => {
    matchmaking.__resetStateForTests();
    gameSessionCore.__resetStateForTests();
    const io = createFakeIo();
    const uuids = [];
    for (let i = 0; i < playerCount; i += 1) uuids.push(await createAccount(`p${i}`));
    const sockets = new Map(uuids.map((uuid) => [uuid, connect(io, uuid)]));
    const [hostUuid, firstJoiner, ...rest] = uuids;
    const rows = {};
    forgetCheckedAccounts();

    // 1판: 방장 공개방 만들기 → 1명 공개방 입장 → 나머지 코드 입장
    const g1 = await createRoom(io, sockets.get(hostUuid), hostUuid, playerCount, 'open');
    rows.createFirst = g1.create;
    rows.publicJoinFirst = await measure(() => handlers.handleJoinPublicRoom(
        io, sockets.get(firstJoiner), firstJoiner, { roomId: g1.room.roomId },
    ));
    const codeFirst = await measure(async () => {
        for (const uuid of rest) await handlers.handleJoinRoomByCode(io, sockets.get(uuid), uuid, g1.room.roomCode);
    });
    rows.codeJoinFirst = perPerson(codeFirst, rest.length);
    await readyAll(io, sockets, uuids, g1.room);
    const start1 = await startGame(io, sockets.get(hostUuid), hostUuid, g1.room);
    rows.startFirst = start1.counts;
    rows.endFirst = await endGame(start1.gameId, uuids);

    // 2판: 끝난 판 방장이 새 방 → 나머지 자동 입장
    const others = uuids.filter((u) => u !== hostUuid);
    const g2 = await createRoom(io, sockets.get(hostUuid), hostUuid, playerCount, 'code', others);
    rows.createNext = g2.create;
    rows.autoJoin = perPerson(g2.autoJoin, others.length);
    await readyAll(io, sockets, uuids, g2.room);
    const start2 = await startGame(io, sockets.get(hostUuid), hostUuid, g2.room);
    rows.startNext = start2.counts;
    rows.endNext = await endGame(start2.gameId, uuids);

    // 3판: 방장 아닌 사람이 공개방 (자동 입장 없음) → 공개방 1명·코드 나머지, 서버가 이미 본 사람들
    const [host3, public3, ...rest3] = [firstJoiner, hostUuid, ...rest];
    const g3 = await createRoom(io, sockets.get(host3), host3, playerCount, 'open');
    rows.publicJoinNext = await measure(() => handlers.handleJoinPublicRoom(
        io, sockets.get(public3), public3, { roomId: g3.room.roomId },
    ));
    const codeNext = await measure(async () => {
        for (const uuid of rest3) await handlers.handleJoinRoomByCode(io, sockets.get(uuid), uuid, g3.room.roomCode);
    });
    rows.codeJoinNext = perPerson(codeNext, rest3.length);
    await readyAll(io, sockets, [host3, public3, ...rest3], g3.room);
    const start3 = await startGame(io, sockets.get(host3), host3, g3.room);
    rows.startThird = start3.counts;
    rows.endThird = await endGame(start3.gameId, uuids);
    flushPublicRoomList(io);
    return rows;
};

const LABELS = {
    createFirst: '방 만들기 (서버가 처음 보는 사람)',
    publicJoinFirst: '공개방 입장 1명 (처음 보는 사람)',
    codeJoinFirst: '코드 입장 1명 (처음 보는 사람)',
    createNext: '방 만들기 (이미 본 사람)',
    autoJoin: '다음 방 자동 입장 1명',
    publicJoinNext: '공개방 입장 1명 (이미 본 사람)',
    codeJoinNext: '코드 입장 1명 (이미 본 사람)',
    startFirst: '판 시작 (1판)',
    startNext: '판 시작 (2판)',
    startThird: '판 시작 (3판)',
    endFirst: '판 끝 (1판)',
    endNext: '판 끝 (2판)',
    endThird: '판 끝 (3판, 3판 업적 지급 있음)',
};

const printTable = (playerCount, rows) => {
    const lines = [`\n[질의 세기] 판당 ${playerCount}명 — 질의 / 거래`];
    for (const [key, label] of Object.entries(LABELS)) {
        const row = rows[key];
        if (!row) continue;
        lines.push(`  ${label}: ${row.queries} / ${row.transactions}`);
        if (row.lines && playerCount === 5) lines.push(...row.lines.map((line) => `      ${line.slice(0, 220)}`));
    }
    console.log(lines.join('\n'));
};

// 바뀐 뒤 상한 (더 늘면 실패, 숫자는 부하시험.md 11-x 표와 같음)
// 사람 수와 상관없는 칸은 5명·10명 같은 상한 (사람마다 따로 묻던 것이 다시 생기면 걸림)
const LIMITS = {
    createFirst: 4, publicJoinFirst: 4, codeJoinFirst: 4,
    createNext: 2, autoJoin: 2, publicJoinNext: 2, codeJoinNext: 2,
    startFirst: 7, startNext: 5, startThird: 5, endFirst: 9, endNext: 9,
};

for (const playerCount of [5, 10]) {
    test(`판당 ${playerCount}명: 입장·시작·끝 질의 수 세기`, async (t) => {
        if (unavailable(t)) return;
        await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
        await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
        const rows = await runCycle(playerCount);
        printTable(playerCount, rows);
        if (process.env.PERF_COUNT_ONLY === '1') return;
        for (const [key, limit] of Object.entries(LIMITS)) {
            assert.ok(rows[key].queries <= limit, `${LABELS[key]} 질의 ${rows[key].queries} > ${limit}`);
        }
    });
}
