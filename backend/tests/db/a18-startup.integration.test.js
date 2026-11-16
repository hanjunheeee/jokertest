'use strict';

// 서버 켤 때 DB 시험(시험 DB) — 표가 다 올라가야 운영 서버가 켜짐, 덜 올라간 개발 서버는 경고만, 켤 때 점검·금지어·탈주 막힘·판 골드를 읽음, 운영엔 시험 손잡이 길 없음, 점검으로 끝난 판은 무효
// 목록 A18-B-301~312 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3) — 서버는 자식 프로세스로 빈 포트에 띄움
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const crypto = require('node:crypto');

// 자식 서버와 이 시험이 같이 쓰는 가짜 서명 값 (이 시험이 만든 토큰을 자식 서버가 믿게), 진짜 값 아님
const CHILD_JWT_SECRET = `fakeA18jwt${crypto.randomBytes(24).toString('hex')}`;
process.env.JWT_SECRET = CHILD_JWT_SECRET;
// 자식 서버 내부 통로·시험 손잡이 열쇠 (32자 넘는 가짜)
const INTERNAL_KEY = `fake-a18-internal-${crypto.randomBytes(16).toString('hex')}`;
const FRONTEND_URL = 'https://front-a18.example.test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Sequelize = require('sequelize');
const { io: connectClient } = require('socket.io-client');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const db = require('../../models');
const { issueSessionForUser } = require('../../services/auth/account/session');

const INDEX = path.resolve(__dirname, '..', '..', 'index.js');
const OS_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'ComSpec', 'TEMP', 'TMP'];
const M0033 = MIGRATIONS.find((m) => m.name.startsWith('0033-'));
const M0034 = MIGRATIONS.find((m) => m.name.startsWith('0034-'));

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    await db.sequelize.close();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── DB 상태 차리기 ──

// 마이그레이션 몇 개를 안 올린 상태로: 그 표 지우고 이력 줄도 지움 → 시험 끝에 다시 다 올림
async function withoutMigrations(t, migrations) {
    const qi = db.sequelize.getQueryInterface();
    for (const m of migrations) {
        await m.down(qi, Sequelize);
        await db.sequelize.query(`DELETE FROM ${migrationRunner.META_TABLE} WHERE name = :name`, { replacements: { name: m.name } });
    }
    t.after(() => migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS }));
}

// 점검 줄 바꾸기 → 시험 끝에 꺼짐으로 되돌림
async function setMaintenance(t, { enabled, startsAt = null }) {
    await db.MaintenanceState.upsert({ id: 1, is_enabled: enabled, message: null, starts_at: startsAt, ends_at: null });
    t.after(() => db.MaintenanceState.upsert({ id: 1, is_enabled: false, message: null, starts_at: null, ends_at: null }));
}

// 새 사람 (시험마다 새 uuid), 로그인 세션 발급 → 토큰
async function createUser(label) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    });
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(user, {}, { ip: '127.0.0.1' }, transaction));
    return { uuid, token: issued.token };
}

// 사람 n명 → 판 골드 장부 줄 (GAME_REWARD)
const rewardRows = (uuids) => db.EconomyLedgerEntry.findAll({ where: { user_id: uuids, reason: 'GAME_REWARD' }, raw: true });

// ── 자식 서버 ──

// 빈 포트 하나 고르기 (잠깐 열었다 닫음)
async function freePort() {
    const probe = net.createServer();
    const { port } = await listenOnFetchablePort(probe);
    await new Promise((resolve) => probe.close(resolve));
    return port;
}

// 서버 시작 파일을 자식으로 띄움 (작업 폴더 = 빈 임시 폴더 → dotenv가 .env를 못 읽음), 시험 끝에 끔
// mode: 'production' | 'development'(시험 손잡이 켬)
async function startServer(t, { mode }) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'b-a18-db-'));
    const port = await freePort();
    const base = Object.fromEntries(OS_KEYS.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    const env = {
        ...base,
        NODE_ENV: mode,
        DATABASE_URL: TEST_DB_URL,
        JWT_SECRET: CHILD_JWT_SECRET,
        FRONTEND_URL,
        INTERNAL_API_KEY: INTERNAL_KEY,
        LOG_DIR: 'off',
        PORT: String(port),
        ...(mode === 'development' ? { E2E_HOOKS: '1' } : {}),
    };
    const child = spawn(process.execPath, [INDEX], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const lines = new (require('node:events').EventEmitter)();
    const onData = (d) => { out += d; lines.emit('data'); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    let exitCode;
    const exited = new Promise((resolve) => child.on('exit', (code) => { exitCode = code; resolve(code); }));
    const clients = [];
    t.after(async () => {
        for (const c of clients) c.close();
        if (exitCode === undefined) { child.kill(); await exited; }
        fs.rmSync(cwd, { recursive: true, force: true });
    });
    const server = {
        port, url: `http://127.0.0.1:${port}`, clients, exited,
        output: () => out,
        // 출력에 그 줄이 뜰 때까지 (켤 때 읽기는 포트 연 뒤 뒤에서 끝나서 켜짐 줄보다 늦을 수 있음, 최대 ms) → 떴는지
        waitOutput: async (pattern, ms = 5_000) => {
            const until = Date.now() + ms;
            while (!pattern.test(out) && Date.now() < until) await sleep(50);
            return pattern.test(out);
        },
        // 켜짐 줄이 뜨거나 프로세스가 끝날 때까지 (최대 40초) → 'ready' | 'exit'
        waitStartup: () => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`40초 안에 안 켜짐·안 끝남: ${out.slice(-800)}`)), 40_000);
            const check = () => {
                if (/\[STARTUP\] 성공/.test(out)) { clearTimeout(timer); lines.off('data', check); resolve('ready'); }
            };
            lines.on('data', check);
            exited.then(() => { clearTimeout(timer); lines.off('data', check); resolve(/\[STARTUP\] 성공/.test(out) ? 'ready' : 'exit'); });
            check();
        }),
    };
    return server;
}

// 소켓 손님 하나 (화면처럼 쿠키 + 정해진 Origin), 붙을 때까지 → 받은 사건 모음
function connectSocket(server, person, { timeout = 5_000 } = {}) {
    return new Promise((resolve, reject) => {
        const client = connectClient(server.url, {
            transports: ['websocket'], reconnection: false, timeout,
            extraHeaders: { cookie: `accessToken=${person.token}`, origin: FRONTEND_URL },
        });
        server.clients.push(client);
        const seen = [];
        client.onAny((event, payload) => seen.push({ event, payload }));
        client.once('connect', () => resolve({ client, seen, uuid: person.uuid }));
        client.once('connect_error', (err) => { client.close(); reject(err); });
    });
}

// 답 받는 사건 (최대 10초)
const ask = (c, event, payload = {}) => c.client.timeout(10_000).emitWithAck(event, payload);

// 그 사건이 올 때까지 (이미 왔으면 바로, 최대 ms)
async function waitEvent(c, event, match = () => true, ms = 15_000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        const hit = c.seen.find((e) => e.event === event && match(e.payload));
        if (hit) return hit.payload;
        await sleep(50);
    }
    throw new Error(`${c.uuid} ${event} 안 옴`);
}

// 내부 통로·시험 손잡이 부르기 (열쇠 붙임)
const keyed = (server, method, route, body) => fetch(`${server.url}${route}`, {
    method,
    headers: { 'X-Internal-Key': INTERNAL_KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

// ── 판 몰기 (자식 서버에 진짜 소켓으로) ──

// n명 방 → 코드 입장 → 전원 준비 → (광대를 맨 끝 사람으로 미리 정함) → 시작 → { gameId, joker }
async function startGame(server, sockets, { presetJoker = true } = {}) {
    const [host, ...guests] = sockets;
    const created = await ask(host, 'create_room', {
        accessType: 'code', maxPlayers: sockets.length, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30,
    });
    assert.equal(created?.ok, true, `방 만들기 실패: ${JSON.stringify(created)}`);
    const { roomId, roomCode, settingsVersion } = created.room;
    for (const g of guests) {
        g.client.emit('join_room_by_code', { roomCode });
        await waitEvent(g, 'room_joined');
    }
    for (const s of sockets) {
        const r = await ask(s, 'set_ready', { roomId, isReady: true, expectedSettingsVersion: settingsVersion });
        assert.equal(r?.ok, true, `준비 실패: ${JSON.stringify(r)}`);
    }
    const joker = sockets.at(-1).uuid;
    if (presetJoker) {
        const res = await keyed(server, 'POST', '/e2e/role-presets', { presets: { [joker]: 'JOKER' }, roomId });
        assert.equal(res.status, 200, '역할 미리 정하기 실패');
    }
    const started = await ask(host, 'start_game', { roomId, expectedSettingsVersion: settingsVersion });
    assert.equal(started?.ok, true, `시작 실패: ${JSON.stringify(started)}`);
    for (const s of sockets) await waitEvent(s, 'game_started');
    return { gameId: started.gameId, joker };
}

// 판 화면 상태 묻기
const snapshotOf = (c, gameId) => ask(c, 'get_session_snapshot', { gameId });

// 조건이 맞을 때까지 판 상태를 봄, nudge(손잡이로 지금 단계 끝내기)는 waitMs 뒤부터 (최대 40초)
async function untilPhase(server, c, gameId, done, { nudgeAfterMs = 0 } = {}) {
    const started = Date.now();
    while (Date.now() - started < 40_000) {
        const s = await snapshotOf(c, gameId);
        if (done(s)) return s;
        if (Date.now() - started >= nudgeAfterMs) await keyed(server, 'POST', `/e2e/games/${gameId}/advance`);
        await sleep(300);
    }
    throw new Error('판이 원하는 단계로 안 감');
}

// 시민 승으로 끝까지: 첫 낮 전원 광대 지목(광대는 기권) → 재판 전원 유죄 → 판 끝
async function playCitizenWin(server, sockets, { gameId, joker }) {
    const host = sockets[0];
    await untilPhase(server, host, gameId, (s) => s.phase === 'DAY');
    for (const s of sockets) await ask(s, 'ready_for_day_vote', { gameId });
    await untilPhase(server, host, gameId, (s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE', { nudgeAfterMs: 3_000 });
    for (const s of sockets) {
        const r = await ask(s, 'cast_day_vote', { gameId, targetId: s.uuid === joker ? null : joker });
        assert.equal(r?.ok, true, `낮 표 거절: ${JSON.stringify(r)}`);
    }
    const tribunal = await untilPhase(server, host, gameId, (s) => s.phase === 'TRIBUNAL', { nudgeAfterMs: 8_000 });
    assert.equal(tribunal.tribunal?.defendantUuid, joker, '재판 피고가 광대가 아님');
    for (const s of sockets.filter((x) => x.uuid !== joker)) {
        const r = await ask(s, 'cast_tribunal_vote', { gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' });
        assert.equal(r?.ok, true, `재판 표 거절: ${JSON.stringify(r)}`);
    }
    await untilPhase(server, host, gameId, (s) => s.phase === 'ENDED', { nudgeAfterMs: 8_000 });
}

// 장부 줄이 n개 될 때까지 (판 끝 저장은 뒤에서 돎, 최대 15초)
async function waitRewards(uuids, count) {
    const until = Date.now() + 15_000;
    let rows = [];
    while (Date.now() < until) {
        rows = await rewardRows(uuids);
        if (rows.length >= count) return rows;
        await sleep(200);
    }
    return rows;
}

// 운영 켜짐 모양 확인
async function assertReady(server) {
    const state = await server.waitStartup();
    assert.equal(state, 'ready', server.output().slice(-1500));
}

// ── 301~304: 운영 + 표 준비 ──

test('A18-B-301 운영 값 + 0034까지 applied → [STARTUP] 성공, /health 200', async (t) => {
    if (noDb(t)) return;
    const server = await startServer(t, { mode: 'production' });
    await assertReady(server);
    const res = await fetch(`${server.url}/health`);
    assert.equal(res.status, 200);
});

// 안 켜지고 끝났는지 + 포트 안 열림
async function assertRefused(server) {
    const state = await server.waitStartup();
    assert.equal(state, 'exit', server.output().slice(-1500));
    assert.equal(await server.exited, 1);
    assert.equal(/\[STARTUP\] 성공/.test(server.output()), false);
    await assert.rejects(fetch(`${server.url}/health`), '포트가 열려 있음');
}

test('A18-B-302 운영 + 0034만 pending → 종료 1, [STARTUP] 실패 — DB 표 준비 안 됨, 글에 0034 이름, 포트 안 열림', async (t) => {
    if (noDb(t)) return;
    await withoutMigrations(t, [M0034]);
    const server = await startServer(t, { mode: 'production' });
    await assertRefused(server);
    assert.match(server.output(), /\[STARTUP\] 실패 — DB 표 준비 안 됨/);
    assert.ok(server.output().includes(M0034.name), server.output().slice(-800));
});

test('A18-B-303 운영 + 0033·0034 둘 다 pending → 종료 1, 글에 두 이름', async (t) => {
    if (noDb(t)) return;
    await withoutMigrations(t, [M0034, M0033]);
    const server = await startServer(t, { mode: 'production' });
    await assertRefused(server);
    assert.ok(server.output().includes(M0033.name), '0033 이름 없음');
    assert.ok(server.output().includes(M0034.name), '0034 이름 없음');
});

test('A18-B-304 운영 + 0034가 failed로 남음 → 종료 1, 실패·멈춘 마이그레이션에 0034', async (t) => {
    if (noDb(t)) return;
    await db.sequelize.query(`UPDATE ${migrationRunner.META_TABLE} SET status = 'failed' WHERE name = :name`, { replacements: { name: M0034.name } });
    t.after(() => db.sequelize.query(`UPDATE ${migrationRunner.META_TABLE} SET status = 'applied' WHERE name = :name`, { replacements: { name: M0034.name } }));
    const server = await startServer(t, { mode: 'production' });
    await assertRefused(server);
    assert.match(server.output(), new RegExp(`실패·멈춘 마이그레이션 \\[[^\\]]*${M0034.name}`));
});

// ── 305~306: 개발 + 표 덜 올라감 ──

test('A18-B-305 [지금 동작] 개발 + 0034 pending → 표 준비 안 됨·판 설정 값 못 읽음 경고 뒤 켜짐, 끝난 5명 판 골드 사람마다 1', async (t) => {
    if (noDb(t)) return;
    await withoutMigrations(t, [M0034]);
    const people = [];
    for (let i = 0; i < 5; i += 1) people.push(await createUser(`g5${i}`));
    const server = await startServer(t, { mode: 'development' });
    await assertReady(server);
    assert.match(server.output(), /DB 표 준비 안 됨/);
    assert.ok(await server.waitOutput(/판 설정 값 못 읽음/), server.output().slice(-1500));
    const sockets = [];
    for (const p of people) sockets.push(await connectSocket(server, p));
    const game = await startGame(server, sockets);
    await playCitizenWin(server, sockets, game);
    const rows = await waitRewards(people.map((p) => p.uuid), 5);
    assert.equal(rows.length, 5, `장부 줄 수 ${rows.length}`);
    for (const p of people) {
        const mine = rows.filter((r) => r.user_id === p.uuid);
        assert.equal(mine.length, 1, `${p.uuid} 장부 줄 수`);
        assert.equal(Number(mine[0].amount), 1);
    }
});

test('A18-B-306 [지금 동작] 개발 + 0033 pending → 탈주 기록 못 읽음 경고 뒤 켜짐, 방 만들기 됨', async (t) => {
    if (noDb(t)) return;
    await withoutMigrations(t, [M0033]);
    const person = await createUser('d306');
    const server = await startServer(t, { mode: 'development' });
    await assertReady(server);
    // 목록 글은 "탈주 기록 못 읽음", 탈주 쪽 자체 경고("[탈주] 막힘 기록 못 읽음")도 같은 뜻으로 받음
    assert.ok(await server.waitOutput(/탈주[^\n]*기록 못 읽음/), server.output().slice(-1500));
    const s = await connectSocket(server, person);
    const created = await ask(s, 'create_room', {
        accessType: 'code', maxPlayers: 5, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30,
    });
    assert.equal(created?.ok, true, JSON.stringify(created));
});

// ── 307~310: 켤 때 읽는 것 ──

test('A18-B-307 점검 켜짐(시작 시각 지남) 줄 → 켜지자마자 붙은 첫 소켓 create_room → MAINTENANCE', async (t) => {
    if (noDb(t)) return;
    await setMaintenance(t, { enabled: true, startsAt: new Date(Date.now() - 60_000) });
    const person = await createUser('m307');
    const server = await startServer(t, { mode: 'production' });
    // 포트가 열리는 첫 순간을 잡으려고 켜짐 줄을 안 기다리고 계속 붙어 봄
    let s = null;
    const until = Date.now() + 40_000;
    while (!s && Date.now() < until) {
        try { s = await connectSocket(server, person, { timeout: 1_000 }); } catch { await sleep(30); }
    }
    assert.ok(s, `소켓이 안 붙음: ${server.output().slice(-800)}`);
    const reply = await ask(s, 'create_room', {
        accessType: 'code', maxPlayers: 5, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30,
    });
    assert.equal(reply?.ok, false, JSON.stringify(reply));
    assert.equal(reply.code, 'MAINTENANCE');
});

test('A18-B-308 [지금 동작] banned_words에 켜진 단어 → 켠 직후 그 단어 든 닉네임으로 바꾸기 → 400 NICKNAME_BANNED_WORD', async (t) => {
    if (noDb(t)) return;
    const word = `zq${crypto.randomBytes(2).toString('hex')}`;
    await db.BannedWord.create({ word, is_active: true });
    t.after(() => db.BannedWord.destroy({ where: { word } }));
    const person = await createUser('w308');
    const server = await startServer(t, { mode: 'production' });
    await assertReady(server);
    const res = await fetch(`${server.url}/user/me/nickname`, {
        method: 'PATCH',
        headers: { cookie: `accessToken=${person.token}`, origin: FRONTEND_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: `${word}a1` }),
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(body.code, 'NICKNAME_BANNED_WORD', `답 본문: ${JSON.stringify(body)}`);
});

test('A18-B-309 game_desertions에 막힘 끝 10분 뒤 줄 → 켠 직후 그 사람 create_room 거절, "탈주로 ○분 ○초 뒤에 참여할 수 있습니다"', async (t) => {
    if (noDb(t)) return;
    const person = await createUser('x309');
    const now = Date.now();
    await db.GameDesertion.create({
        user_id: person.uuid, game_id: crypto.randomUUID(), reason: 'LEFT_ALIVE',
        deserted_at: new Date(now - 60_000), blocked_until: new Date(now + 10 * 60_000),
    });
    const server = await startServer(t, { mode: 'production' });
    await assertReady(server);
    const s = await connectSocket(server, person);
    const reply = await ask(s, 'create_room', {
        accessType: 'code', maxPlayers: 5, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30,
    });
    assert.equal(reply?.ok, false, JSON.stringify(reply));
    assert.match(reply.message, /탈주로 \d+분 \d+초 뒤에 참여할 수 있습니다/);
});

test('A18-B-310 game_settings GAME_GOLD_REWARD = 3 → 켠 뒤 시작한 6명 판이 끝나면 장부 사람마다 +3', async (t) => {
    if (noDb(t)) return;
    await db.sequelize.query("UPDATE game_settings SET value_int = 3 WHERE `key` = 'GAME_GOLD_REWARD'");
    t.after(() => db.sequelize.query("UPDATE game_settings SET value_int = 1 WHERE `key` = 'GAME_GOLD_REWARD'"));
    const people = [];
    for (let i = 0; i < 6; i += 1) people.push(await createUser(`g6${i}`));
    const server = await startServer(t, { mode: 'development' });
    await assertReady(server);
    const sockets = [];
    for (const p of people) sockets.push(await connectSocket(server, p));
    const game = await startGame(server, sockets);
    await playCitizenWin(server, sockets, game);
    const rows = await waitRewards(people.map((p) => p.uuid), 6);
    assert.equal(rows.length, 6, `장부 줄 수 ${rows.length}`);
    for (const p of people) {
        const mine = rows.filter((r) => r.user_id === p.uuid);
        assert.equal(mine.length, 1, `${p.uuid} 장부 줄 수`);
        assert.equal(Number(mine[0].amount), 3);
    }
});

// ── 311~312 ──

test('A18-B-311 운영 값 서버에 맞는 열쇠 붙여 POST /e2e/games/x/advance → 404', async (t) => {
    if (noDb(t)) return;
    const server = await startServer(t, { mode: 'production' });
    await assertReady(server);
    const res = await keyed(server, 'POST', '/e2e/games/x/advance', {});
    assert.equal(res.status, 404);
    // 손잡이 길이 받았으면 "판 없음" 답 모양 404 → 그 모양이 없어야 "길 자체 없음" (저장 금지 머리는 서버 전체에 붙어 못 씀)
    assert.doesNotMatch(await res.text(), /NO_GAME|"ok":false,"code"/);
});

test('A18-B-312 점검 시작 시각에 강제 종료된 5명 판 → 끝 이유 MAINTENANCE·승패 없음, game_desertions 0줄, 장부 GAME_REWARD 0줄', async (t) => {
    if (noDb(t)) return;
    const people = [];
    for (let i = 0; i < 5; i += 1) people.push(await createUser(`m5${i}`));
    const uuids = people.map((p) => p.uuid);
    const server = await startServer(t, { mode: 'development' });
    await assertReady(server);
    const sockets = [];
    for (const p of people) sockets.push(await connectSocket(server, p));
    const { gameId } = await startGame(server, sockets, { presetJoker: false });
    // 시작 시각 3초 뒤 점검 예약 → 관리자 저장 뒤처럼 서버에 다시 읽게 함
    await setMaintenance(t, { enabled: true, startsAt: new Date(Date.now() + 3_000) });
    const reload = await keyed(server, 'POST', '/internal/maintenance/reload');
    assert.equal(reload.status, 200, '점검 다시 읽기 실패');
    for (const s of sockets) await waitEvent(s, 'game_ended', (p) => p?.gameId === gameId && p?.reason === 'MAINTENANCE', 20_000);

    let row = null;
    for (let i = 0; i < 75 && !row; i += 1) {
        row = await db.GameResult.findOne({ where: { id: gameId }, raw: true });
        if (!row) await sleep(200);
    }
    assert.ok(row, '판 기록 줄 없음');
    assert.equal(row.win_reason, 'MAINTENANCE');
    const players = await db.GameResultPlayer.findAll({ where: { game_id: gameId }, raw: true });
    assert.equal(players.length, 5);
    for (const p of players) assert.equal(p.won, null, `${p.user_id} 승패가 남음`);
    assert.equal(await db.GameDesertion.count({ where: { user_id: uuids } }), 0);
    // 판 끝 저장이 다 돈 뒤에도 0줄인지 잠깐 더 봄
    await sleep(1_000);
    assert.equal((await rewardRows(uuids)).length, 0);
});
