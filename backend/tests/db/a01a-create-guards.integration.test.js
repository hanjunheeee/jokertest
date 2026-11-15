'use strict';

// 방 만들기 DB 시험 — 탈주 막힘이 DB에서 살아남음·그날 횟수·자정 넘김, 점검 줄 다시 읽기·글·끝 예정·읽기 실패, 방 이름·계정 없음·장착 프로필
// 목록 A01-B-181~195 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "DB 붙는 것")
// 돌리기(저장소 쪽 잠금으로 한 줄 세움): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a01a-create-guards.integration.test.js
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const db = require('../../models');
const matchmaking = require('../../socket/matchmaking');
const mf = require('../helpers/matchmakingFixtures');
const desertion = require('../../services/game/desertion');
const maintenance = require('../../services/ops/maintenance');
const economyService = require('../../services/economy');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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

// 시험마다 새 사람 (uuid가 달라 시험끼리 안 섞임)
async function createUser(label, nickname = null) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: nickname ?? `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

// 점검 줄(id 1) 쓰기 → 서버처럼 다시 읽기
async function setMaintenanceRow({ enabled, message = null, startsAt = null, endsAt = null }) {
    await db.MaintenanceState.upsert({ id: 1, is_enabled: enabled, message, starts_at: startsAt, ends_at: endsAt, updated_at: new Date() });
    await maintenance.reloadMaintenance();
}

// 탈주 줄 바로 쓰기 (지난 판 기록)
async function insertDesertionRow(userId, { desertedAt, blockedUntil }) {
    await db.GameDesertion.create({
        user_id: userId, game_id: crypto.randomUUID(), reason: 'LEFT_ALIVE', deserted_at: desertedAt, blocked_until: blockedUntil,
    });
}

// 진짜 서비스(DB)로 도는 대기방 세상: 가짜 소켓·io만 가짜, 시험 끝에 장부·점검·탈주 메모리 비움
function makeDbWorld(t) {
    matchmaking.__resetStateForTests();
    desertion.__resetForTests();
    desertion.__setRepositoryForTests(null);
    maintenance.__setStateForTests({});
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    t.after(async () => {
        matchmaking.__resetStateForTests();
        desertion.__resetForTests();
        maintenance.__setStateForTests({});
        await db.MaintenanceState.destroy({ where: { id: 1 } });
    });
    const sockets = new Map();
    const connect = (uuid) => {
        const s = mf.createFakeSocket(uuid);
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        matchmaking.registerMatchmakingHandlers(io, s, uuid, { getCurrentSocketId: (u) => registry.get(u) });
        return s;
    };
    const emit = (uuid, event, payload) => new Promise((resolve) => sockets.get(uuid).trigger(event, payload, resolve));
    const create = (uuid, overrides = {}) => emit(uuid, 'create_room', {
        accessType: 'open', maxPlayers: 10, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60, ...overrides,
    });
    const currentRoom = async (uuid) => (await emit(uuid, 'get_current_room', {})).room;
    return { io, connect, emit, create, currentRoom };
}

// Date.now를 잠깐 정한 시각으로 바꿔 fn 돌림 (탈주 막힘 계산이 이 시계를 봄)
async function atTime(t, ms, fn) {
    const m = t.mock.method(Date, 'now', () => ms);
    try {
        return await fn();
    } finally {
        m.mock.restore();
    }
}

// ── 탈주 ──
test('A01-B-181 game_desertions에 막힘 끝 = 지금+10분 줄 → 서버 켤 때 읽기 → create_room DESERTION_COOLDOWN, 글 "탈주로 9분 …"', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d181');
    const now = Math.floor(Date.now() / 1000) * 1000;
    await insertDesertionRow(uuid, { desertedAt: new Date(now), blockedUntil: new Date(now + 10 * MINUTE) });
    // 서버 켬 = 메모리 비우고 DB에서 읽기
    desertion.__resetForTests();
    const loaded = await desertion.loadActiveDesertions(now);
    assert.equal(loaded.ok, true);
    w.connect(uuid);
    // 켠 뒤 1초 지나 방 만들기 (남은 9분 59초)
    const reply = await atTime(t, now + 1000, () => w.create(uuid));
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'DESERTION_COOLDOWN');
    assert.match(reply.message, /^탈주로 9분 /);
});

test('A01-B-182 막힘 끝이 지난 줄만 → 방 만들어짐', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d182');
    const now = Date.now();
    await insertDesertionRow(uuid, { desertedAt: new Date(now - 20 * MINUTE), blockedUntil: new Date(now - 15 * MINUTE) });
    desertion.__resetForTests();
    assert.equal((await desertion.loadActiveDesertions()).ok, true);
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.ok, true, reply.message);
});

// 가짜 "지금": 2026-11-16 12:00 한국 시간 (그날 횟수가 자정에 안 걸리게 한낮)
const NOON_KST = Date.UTC(2026, 10, 16, 3, 0, 0);
const NTH_CASES = [
    ['A01-B-183', 0, '탈주로 5분 0초 뒤에 참여할 수 있습니다.'],
    ['A01-B-184', 1, '탈주로 30분 0초 뒤에 참여할 수 있습니다.'],
    ['A01-B-185', 2, '탈주로 24시간 0분 0초 뒤에 참여할 수 있습니다.'],
];
for (const [no, prior, text] of NTH_CASES) {
    test(`${no} 오늘(한국 시간) 탈주 ${prior}줄인 사람이 새로 탈주 → create_room "${text}"`, async (t) => {
        if (noDb(t)) return;
        const w = makeDbWorld(t);
        const uuid = await createUser(`d${no.slice(-3)}`);
        // 오늘 앞선 탈주는 DB에만 (메모리는 비어 있음 = 다른 서버에서 났거나 서버를 다시 켬)
        for (let i = 0; i < prior; i += 1) {
            const at = NOON_KST - (prior - i) * HOUR;
            await insertDesertionRow(uuid, { desertedAt: new Date(at), blockedUntil: new Date(at + 5 * MINUTE) });
        }
        desertion.__resetForTests();
        w.connect(uuid);
        const reply = await atTime(t, NOON_KST, async () => {
            const r = await desertion.recordDesertion({ userId: uuid, gameId: crypto.randomUUID(), reason: 'LEFT_ALIVE', desertedAt: NOON_KST });
            assert.equal(r.saved, true, '탈주 줄을 못 씀');
            return w.create(uuid);
        });
        assert.equal(reply.code, 'DESERTION_COOLDOWN');
        assert.equal(reply.message, text);
    });
}

test('A01-B-186 한국 시간 23:50 세 번째 탈주 → 다음 날 00:10 create_room → 거절, 남은 23시간 40분', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d186');
    const at2350 = Date.UTC(2026, 10, 16, 14, 50, 0); // 2026-11-16 23:50 KST
    const next0010 = Date.UTC(2026, 10, 16, 15, 10, 0); // 2026-11-17 00:10 KST
    for (const hour of [10, 11]) {
        const at = Date.UTC(2026, 10, 16, hour - 9, 0, 0);
        await insertDesertionRow(uuid, { desertedAt: new Date(at), blockedUntil: new Date(at + 5 * MINUTE) });
    }
    desertion.__resetForTests();
    w.connect(uuid);
    const recorded = await atTime(t, at2350, () =>
        desertion.recordDesertion({ userId: uuid, gameId: crypto.randomUUID(), reason: 'LEFT_ALIVE', desertedAt: at2350 }));
    assert.equal(recorded.nth, 3);
    const expected = { code: 'DESERTION_COOLDOWN', message: '탈주로 23시간 40분 0초 뒤에 참여할 수 있습니다.', retryAfterMs: 23 * HOUR + 40 * MINUTE };
    const reply = await atTime(t, next0010, () => w.create(uuid));
    assert.deepEqual({ code: reply.code, message: reply.message, retryAfterMs: reply.retryAfterMs }, expected);
    // 서버를 다시 켜도(메모리 비우고 DB에서 읽음) 같음
    desertion.__resetForTests();
    assert.equal((await desertion.loadActiveDesertions(next0010)).ok, true);
    const again = await atTime(t, next0010, () => w.create(uuid));
    assert.deepEqual({ code: again.code, message: again.message, retryAfterMs: again.retryAfterMs }, expected);
});

// ── 점검 줄 ──
test('A01-B-187 maintenance_state 켜짐·시작 시각 과거 → 다시 읽기 → create_room MAINTENANCE', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d187');
    await setMaintenanceRow({ enabled: true, startsAt: new Date(Date.now() - HOUR) });
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'MAINTENANCE');
    assert.equal(await w.currentRoom(uuid), null);
});

test('A01-B-188 켜짐·시작 시각 1시간 뒤 → 다시 읽기 → 방 만들어짐', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d188');
    await setMaintenanceRow({ enabled: true, startsAt: new Date(Date.now() + HOUR) });
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.ok, true, reply.message);
});

test('A01-B-189 점검 꺼진 줄 → 다시 읽기 → 방 만들어짐', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d189');
    await setMaintenanceRow({ enabled: false, startsAt: new Date(Date.now() - HOUR) });
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.ok, true, reply.message);
});

test('A01-B-190 점검 글 "오전 점검" → 거절 글 "오전 점검"', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d190');
    await setMaintenanceRow({ enabled: true, message: '오전 점검', startsAt: new Date(Date.now() - HOUR) });
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.code, 'MAINTENANCE');
    assert.equal(reply.message, '오전 점검');
});

test('A01-B-191 ends_at 있음 → 거절 답 endsAt = 그 시각 ISO 글', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d191');
    const endsAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 2 * HOUR);
    await setMaintenanceRow({ enabled: true, startsAt: new Date(Date.now() - HOUR), endsAt });
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.code, 'MAINTENANCE');
    assert.equal(reply.endsAt, endsAt.toISOString());
});

test('A01-B-192 [지금 동작] 점검 중 상태에서 DB 읽기가 던짐 → 점검 그대로(계속 거절)', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d192');
    await setMaintenanceRow({ enabled: true, startsAt: new Date(Date.now() - HOUR) });
    const broken = { MaintenanceState: { findOne: async () => { throw new Error('DB 읽기 실패(시험)'); } } };
    await assert.rejects(maintenance.reloadMaintenance({ db: broken }));
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.code, 'MAINTENANCE');
});

// ── 계정·프로필 ──
test('A01-B-193 users 닉네임 "새이름"으로 바꾼 뒤 만듦 → "새이름의 방"', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d193');
    await db.User.update({ nickname: '새이름' }, { where: { uuid } });
    w.connect(uuid);
    const reply = await w.create(uuid, { accessType: 'open' });
    assert.equal(reply.ok, true, reply.message);
    const listed = await w.emit(uuid, 'get_public_rooms', {});
    assert.equal(listed.rooms.find((r) => r.id === reply.room.roomId)?.title, '새이름의 방');
});

test('A01-B-194 [지금 동작] 지워진 계정 uuid로 create_room → "사용자 정보를 찾을 수 없습니다.", 방 없음', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d194');
    await db.User.destroy({ where: { uuid } });
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '사용자 정보를 찾을 수 없습니다.');
    assert.equal(await w.currentRoom(uuid), null);
});

test('A01-B-195 [지금 동작] 프로필 사진·테두리 장착 계정 → 답 명단 accountProfilePhotoId·accountProfileBorderId 그 값', async (t) => {
    if (noDb(t)) return;
    const w = makeDbWorld(t);
    const uuid = await createUser('d195');
    // 기본 장착 줄을 만든 뒤 사진·테두리 칸을 다른 값으로
    await economyService.getPublicProfileLoadouts([uuid]);
    const photo = 'player-profile-시험사진';
    const border = 'profile-border-시험테두리';
    await db.sequelize.query(
        'UPDATE economy_loadouts SET selected_profile_photo_id = ?, selected_profile_border_id = ? WHERE user_id = ?',
        { replacements: [photo, border, uuid] },
    );
    w.connect(uuid);
    const reply = await w.create(uuid);
    assert.equal(reply.ok, true, reply.message);
    const me = reply.room.players.find((p) => p.uuid === uuid);
    assert.equal(me.accountProfilePhotoId, photo);
    assert.equal(me.accountProfileBorderId, border);
});
