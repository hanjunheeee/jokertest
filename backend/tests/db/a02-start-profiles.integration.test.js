'use strict';

// 시작 때 읽는 계정 값 시험(시험 DB) — 프로필 꾸밈·전적·직업 스킨·이모티콘 팔레트가 시작 알림에 실리는지, 읽기 실패 때 시작되는지, 시작만으론 판 기록 없음
// 목록 A02-B-271~280 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "시작 때 읽는 계정 값"), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models·socket require보다 먼저
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
const economyService = require('../../services/economy');
const catalog = require('../../services/economy/catalog');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const mf = require('../helpers/matchmakingFixtures');
const e2eHooks = require('../../socket/e2e/gameHooks');
const gameCore = require('../../game-core/gameSession');
const { getSessionById } = require('../../game-core/queries/byId');

const MM = matchmaking.__testables;
const G = gs.__testables;
const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음), 있으면 파일 처음에 한 번 비우고 끝까지 올림
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

// 상품 목록에서 그 종류 첫 상품 id (예: 'PROFILE_PHOTO' → 'player-profile-귀부인'), 직업 스킨은 앞말로 고름
const firstItem = (type, prefix = '') => catalog.ALL_ITEMS.find((it) => it.type === type && it.id.startsWith(prefix)).id;
const SKINS = {
    noble: firstItem('SKIN', 'player-skin-귀족'),
    clown: firstItem('SKIN', 'player-skin-광대'),
    guard: firstItem('SKIN', 'player-skin-경비원'),
    doctor: firstItem('SKIN', 'player-skin-주치의'),
    witchHunter: firstItem('SKIN', 'player-skin-마녀사냥꾼'),
};
// 직업 스킨 id → 장착 행 칸
const SKIN_COLUMNS = {
    noble: 'selected_skin_noble', clown: 'selected_skin_clown', guard: 'selected_skin_guard',
    doctor: 'selected_skin_doctor', witchHunter: 'selected_skin_witch_hunter',
};

// 시험마다 새 사람 n명 (uuid가 달라 같은 파일 시험끼리 안 섞임)
async function createUsers(label, n) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({
            uuid,
            password_hash: 'not-a-real-hash',
            nickname: `${label}${i}${uuid.slice(0, 3)}`.slice(0, 8),
            email: `${label}-${i}-${uuid}@example.test`,
        });
        uuids.push(uuid);
    }
    // 기본 장착 행·기본 보유를 먼저 만들어 둠 (아래에서 장착 칸을 바꾸려고)
    await economyService.getGameStartLoadouts(uuids);
    return uuids;
}

// 장착 행 칸 바꾸기 (화면에서 장착한 것과 같은 DB 줄)
const setLoadout = (uuid, columns) => db.sequelize.models.EconomyLoadout.update(columns, { where: { user_id: uuid } });

// 판 기록 n판 넣기 (이긴 판 수 wins), 출처 없는 옛 판 모양 → 통계에 셈
async function insertRecords(uuid, games, wins) {
    for (let i = 0; i < games; i += 1) {
        const id = crypto.randomUUID();
        const at = new Date(Date.UTC(2026, 10, 1 + i));
        await db.GameResult.create({ id, started_at: at, ended_at: at, winner: 'CITIZEN', day_index: 2, player_count: 5, settings: null, completed: true });
        await db.GameResultPlayer.create({ game_id: id, user_id: uuid, nickname_snapshot: '기록', role: 'CITIZEN', team: 'CITIZEN', won: i < wins, is_alive: true });
    }
}

// ── 대기방 → 시작 세상 (진짜 서비스·시험 DB, 바꿀 것만 overrides) ──
function makeWorld(t, { economy = null, records = null } = {}) {
    gameCore.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    matchmaking.__setEconomyServiceForTests(economy);
    matchmaking.__setGameResultRepositoryForTests(records);
    t.mock.method(Math, 'random', () => 0);
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        e2eHooks.clearRolePresets();
        gameCore.__resetStateForTests();
        matchmaking.__setEconomyServiceForTests(null);
        matchmaking.__setGameResultRepositoryForTests(null);
    });
    const sockets = new Map();
    const connect = (uuid) => {
        const s = mf.createFakeSocket(uuid);
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    const received = (uuid, event) => sock(uuid).received.filter((e) => e.event === event).map((e) => e.payload);

    // 방 만들기 → 코드 입장 → 전원 준비 → 시작 (방장 = 첫 사람), presets = { uuid: 역할 }이면 역할 미리 정하기 손잡이 켬
    async function openAndStart(uuids, { presets = null } = {}) {
        for (const uuid of uuids) connect(uuid);
        const [host, ...guests] = uuids;
        const payload = { accessType: 'code', maxPlayers: uuids.length, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60 };
        const created = await mf.callAsPromise(MM.handleCreateRoom, io, sock(host), host, payload);
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await MM.handleJoinRoomByCode(io, sock(uuid), uuid, created.room.roomCode);
        for (const uuid of uuids) {
            const r = await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(created.room));
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        const saved = process.env.E2E_HOOKS;
        if (presets) {
            process.env.E2E_HOOKS = '1';
            e2eHooks.setRolePresets(presets, { roomId: created.room.roomId });
        }
        try {
            const reply = await mf.callAsPromise(MM.handleStartGame, io, sock(host), host, mf.startPayload(created.room));
            const started = new Map(uuids.map((uuid) => [uuid, received(uuid, 'game_started').at(-1)]));
            return { reply, started };
        } finally {
            if (saved === undefined) delete process.env.E2E_HOOKS;
            else process.env.E2E_HOOKS = saved;
        }
    }

    const sendEmoji = (uuid, gameId, itemId) => mf.callAsPromise(G.handleSendEmoji, io, sock(uuid), uuid, { gameId, itemId });

    return { io, sock, received, openAndStart, sendEmoji };
}

// 진짜 경제 서비스를 그대로 쓰되 몇 함수만 바꿈
const economyWith = (patch) => ({ ...economyService, ...patch });

test('A02-B-271 사진·테두리·카드틀을 장착한 5명 → game_started.players에 그 값', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p271', 5);
    const photo = firstItem('PROFILE_PHOTO');
    const border = firstItem('PROFILE_BORDER');
    const frame = firstItem('PLAYER_CARD_FRAME');
    for (const uuid of uuids) {
        await setLoadout(uuid, { selected_profile_photo_id: photo, selected_profile_border_id: border, selected_card_frame_id: frame });
    }
    const w = makeWorld(t);
    const { reply, started } = await w.openAndStart(uuids);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    for (const p of started.get(uuids[0]).state.players) {
        assert.equal(p.accountProfilePhotoId, photo, p.uuid);
        assert.equal(p.accountProfileBorderId, border, p.uuid);
        assert.equal(p.accountCardFrameId, frame, p.uuid);
    }
});

test('A02-B-272 판 기록 3판(2승)인 계정 포함 6명 → 그 사람 accountTotalGames 3, 승률 값', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p272', 6);
    const veteran = uuids[2];
    await insertRecords(veteran, 3, 2);
    const w = makeWorld(t);
    const { reply, started } = await w.openAndStart(uuids);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    const me = started.get(uuids[0]).state.players.find((p) => p.uuid === veteran);
    assert.equal(me.accountTotalGames, 3);
    // 2승 / 3판 → 백분율 반올림
    assert.equal(me.accountWinRate, Math.round((2 / 3) * 100));
});

test('A02-B-273 [지금 동작] 전적 읽기가 실패하게 한 7명 → 시작 됨, 전적 칸 없음', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p273', 7);
    const w = makeWorld(t, { records: { getAccountRecordSummaries: async () => { throw new Error('전적 읽기 실패(시험)'); } } });
    const { reply, started } = await w.openAndStart(uuids);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    for (const p of started.get(uuids[0]).state.players) {
        assert.equal(Object.hasOwn(p, 'accountTotalGames'), false, p.uuid);
        assert.equal(Object.hasOwn(p, 'accountWinRate'), false, p.uuid);
    }
});

test('A02-B-274 의사 스킨 장착 계정이 의사(6명) → 그 사람 self.accountSkinId, 다른 5명 알림엔 그 스킨 값 없음', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p274', 6);
    const doctor = uuids[3];
    await setLoadout(doctor, { selected_skin_doctor: SKINS.doctor });
    const w = makeWorld(t);
    const { reply, started } = await w.openAndStart(uuids, { presets: { [doctor]: 'DOCTOR' } });
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    assert.equal(started.get(doctor).state.self.role, 'DOCTOR', '미리 정한 직업이 안 맞음');
    assert.equal(started.get(doctor).state.self.accountSkinId, SKINS.doctor);
    for (const uuid of uuids.filter((u) => u !== doctor)) {
        assert.equal(JSON.stringify(started.get(uuid)).includes(SKINS.doctor), false, `${uuid} 알림에 의사 스킨이 샘`);
    }
});

test('A02-B-275 다섯 직업 스킨을 다 장착한 계정이 경비원(8명) → 경비원 스킨 하나만', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p275', 8);
    const guard = uuids[5];
    await setLoadout(guard, Object.fromEntries(Object.entries(SKIN_COLUMNS).map(([job, column]) => [column, SKINS[job]])));
    const w = makeWorld(t);
    const { reply, started } = await w.openAndStart(uuids, { presets: { [guard]: 'GUARD' } });
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    const mine = started.get(guard);
    assert.equal(mine.state.self.role, 'GUARD', '미리 정한 직업이 안 맞음');
    assert.equal(mine.state.self.accountSkinId, SKINS.guard);
    const text = JSON.stringify(mine);
    for (const job of ['noble', 'clown', 'doctor', 'witchHunter']) assert.equal(text.includes(SKINS[job]), false, `${job} 스킨이 실림`);
});

// 그 사람 팔레트에 들어 있고 가진 이모티콘 하나 (기본 팔레트 그대로)
async function paletteEmoji(uuid) {
    const palette = await economyService.getEmojiPalette(uuid);
    return palette.slots.find((id) => id && palette.owned.includes(id));
}

// 역할 확인을 바로 끝내 첫 낮으로 (이모티콘은 낮에만 됨)
function toFirstDay(gameId) {
    const r = gameCore.forceCompleteRoleReveal(getSessionById(gameId));
    assert.equal(r.ok && r.transitioned, true, `첫 낮 실패: ${r.code}`);
}

test('A02-B-276 팔레트에 이모티콘 넣은 계정(5명) → 역할 확인 중엔 INVALID_PHASE, 첫 낮에 그 이모티콘 send_emoji 됨', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p276', 5);
    const sender = uuids[1];
    const emoji = await paletteEmoji(sender);
    assert.ok(emoji, '팔레트에 가진 이모티콘이 없음');
    const w = makeWorld(t);
    const { reply } = await w.openAndStart(uuids);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    assert.equal((await w.sendEmoji(sender, reply.gameId, emoji)).code, 'INVALID_PHASE');
    toFirstDay(reply.gameId);
    const sent = await w.sendEmoji(sender, reply.gameId, emoji);
    assert.equal(sent.ok, true, `이모티콘 거절: ${sent.code}`);
    for (const uuid of uuids) assert.equal(w.received(uuid, 'emoji_shown').length, 1, uuid);
});

test('A02-B-277 [지금 동작] 1명 팔레트 읽기 실패(6명) → 시작 됨, 그 사람만 이모티콘 거절', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p277', 6);
    const broken = uuids[2];
    const other = uuids[4];
    const emojiOfBroken = await paletteEmoji(broken);
    const emojiOfOther = await paletteEmoji(other);
    // 묶어 읽기는 실패 → 한 사람씩 읽기에서 broken만 실패
    const w = makeWorld(t, {
        economy: economyWith({
            getEmojiPalettes: async () => { throw new Error('묶어 읽기 실패(시험)'); },
            getEmojiPalette: async (uuid) => {
                if (uuid === broken) throw new Error('팔레트 읽기 실패(시험)');
                return economyService.getEmojiPalette(uuid);
            },
        }),
    });
    const { reply } = await w.openAndStart(uuids);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    // 첫 낮에 보냄 (역할 확인 중엔 누구나 거절이라 팔레트 탓인지 못 가림)
    toFirstDay(reply.gameId);
    assert.equal((await w.sendEmoji(broken, reply.gameId, emojiOfBroken)).code, 'NOT_OWNED');
    assert.equal((await w.sendEmoji(other, reply.gameId, emojiOfOther)).ok, true);
});

test('A02-B-278 7명 시작 → 판 기록 표 줄 0개', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p278', 7);
    const w = makeWorld(t);
    const { reply } = await w.openAndStart(uuids);
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    assert.equal(await db.GameResult.count({ where: { id: reply.gameId } }), 0);
    assert.equal(await db.GameResultPlayer.count({ where: { user_id: uuids } }), 0);
});

test('A02-B-279 [지금 동작] 외형 읽기가 실패(5명) → 거절 문구, 판 없음', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p279', 5);
    const w = makeWorld(t, { economy: economyWith({ getGameStartLoadouts: async () => { throw new Error('외형 읽기 실패(시험)'); } }) });
    const { reply } = await w.openAndStart(uuids);
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '게임을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
    for (const uuid of uuids) assert.equal(w.received(uuid, 'game_started').length, 0, uuid);
});

test('A02-B-280 [지금 동작] 스킨 장착 안 한 시민(5명) → self에 accountSkinId 칸 있음, 값 null', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers('p280', 5);
    const citizen = uuids[2];
    await setLoadout(citizen, Object.fromEntries(Object.values(SKIN_COLUMNS).map((column) => [column, null])));
    const w = makeWorld(t);
    const { reply, started } = await w.openAndStart(uuids, { presets: { [citizen]: 'CITIZEN' } });
    assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
    const { self } = started.get(citizen).state;
    assert.equal(self.role, 'CITIZEN', '미리 정한 직업이 안 맞음');
    // 장착 읽기가 직업마다 칸을 늘 채워(빈 직업은 null) 시민도 귀족 칸이 실림, 화면은 null·칸 없음 둘 다 기본 스킨
    assert.equal(Object.hasOwn(self, 'accountSkinId'), true, 'accountSkinId 칸 없음');
    assert.equal(self.accountSkinId, null);
});
