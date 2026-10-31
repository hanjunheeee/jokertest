'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f33-emoji-palette-integration-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const cookieParser = require('cookie-parser');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addEmojiPalettes = require('../../db/migrations/0019-add-emoji-palettes');
const {
    buildManagedSchema, resetManagedSchema, resetManagedData, findNonEmptyManagedTables,
} = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, migrationRunner,
});

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
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) throw connectionError;
    return false;
};

const db = require('../../models');
const economyService = require('../../service/economy.service');
const { hashPassword } = require('../../utils/hash');
const { generateToken } = require('../../utils/jwt');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const DATA_TABLES = DROP_ORDER.filter((table) => table !== migrationRunner.META_TABLE);

let schemaState = 'unknown';

const rebuildSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    schemaState = 'migrated';
};

const setUp = async () => {
    if (schemaState !== 'migrated') {
        await rebuildSchema();
    } else {
        const result = await resetManagedData(sequelize, TEST_DB_URL, {
            managedTables: MANAGED_TABLES,
            dropOrder: DROP_ORDER,
            keepTables: [migrationRunner.META_TABLE],
        });
        if (!result.cleaned) await rebuildSchema();
    }

    assert.deepEqual(
        await findNonEmptyManagedTables(sequelize, DATA_TABLES), [],
        '앞 케이스의 행이 남아 있으면 이 케이스의 단정은 의미가 없다',
    );
    await addEmojiPalettes.verify(sequelize.getQueryInterface());
};

let sharedPasswordHash = null;
const testPasswordHash = async () => {
    if (sharedPasswordHash === null) sharedPasswordHash = await hashPassword('correct-horse-battery-1');
    return sharedPasswordHash;
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, Math.max(1, 8 - label.length))}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await testPasswordHash(),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    await db.UserSession.create({ id: `session-${uuid}`, user_id: uuid, is_online: true });
    return uuid;
};

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/user', require('../../routes/user.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const tokenFor = (uuid) => generateToken({ uuid, role: 'USER', sessionId: `session-${uuid}` });

const getPalette = async (base, uuid) => {
    const response = await fetch(`${base}/user/me/emoji-palette`, {
        headers: { cookie: `accessToken=${tokenFor(uuid)}` },
    });
    return { status: response.status, body: await response.json() };
};

const putPalette = async (base, uuid, body) => {
    const response = await fetch(`${base}/user/me/emoji-palette`, {
        method: 'PUT',
        headers: { cookie: `accessToken=${tokenFor(uuid)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
};

const DEFAULT_SLOTS = [
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
];

const grantEmoticon = async (userId, itemId) => {
    await economyService.grantAchievementItem({
        userId, itemId, itemType: 'EMOTICON', referenceEventId: `f33-grant:${userId}:${itemId}`,
    });
};

const paletteRow = async (userId) => await db.sequelize.models.EconomyEmojiPalette.findOne({
    where: { user_id: userId }, raw: true,
});

test('AC-01: 팔레트 행이 없는 계정의 GET은 설계도 §0 순서의 기본 8종과 revision·owned를 돌려준다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33a');
    assert.equal(await paletteRow(userId), null, '조회 전에는 팔레트 행이 없어야 이 시험이 기본값 경로를 본다');

    const base = await startRouteServer(t);
    const { status, body } = await getPalette(base, userId);

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.slots, DEFAULT_SLOTS);
    assert.equal(typeof body.revision, 'string');
    assert.ok(body.revision.length > 0);
    assert.deepEqual([...body.owned].sort(), [...DEFAULT_SLOTS].sort());

    const again = await getPalette(base, userId);
    assert.deepEqual(again.body.slots, DEFAULT_SLOTS);
    assert.equal(again.body.revision, body.revision);
});

test('AC-02: PUT으로 저장한 slots·revision이 이어지는 GET에서 그대로 돌아온다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33b');
    const base = await startRouteServer(t);
    await grantEmoticon(userId, 'emoji-startled');

    const before = await getPalette(base, userId);
    const nextSlots = [...DEFAULT_SLOTS];
    nextSlots[0] = 'emoji-startled';

    const saved = await putPalette(base, userId, { slots: nextSlots, expectedRevision: before.body.revision });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.ok, true);
    assert.deepEqual(saved.body.slots, nextSlots);
    assert.notEqual(saved.body.revision, before.body.revision, '저장할 때마다 새 revision이 발급되어야 한다');

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, nextSlots);
    assert.equal(after.body.revision, saved.body.revision);
});

test('AC-03: expectedRevision이 현재 값과 다르면 409 REVISION_MISMATCH와 현재 slots·revision이 함께 돌아온다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33c');
    const base = await startRouteServer(t);

    const first = await getPalette(base, userId);
    const staleRevision = first.body.revision;

    const rotated = [...DEFAULT_SLOTS].reverse();
    const winner = await putPalette(base, userId, { slots: rotated, expectedRevision: staleRevision });
    assert.equal(winner.status, 200);

    const conflicted = await putPalette(base, userId, { slots: DEFAULT_SLOTS, expectedRevision: staleRevision });
    assert.equal(conflicted.status, 409);
    assert.equal(conflicted.body.ok, false);
    assert.equal(conflicted.body.code, 'REVISION_MISMATCH');
    assert.equal(conflicted.body.revision, winner.body.revision);
    assert.deepEqual(conflicted.body.slots, rotated);

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, rotated);
    assert.equal(after.body.revision, winner.body.revision);
});

test('AC-03(동시성): 같은 expectedRevision으로 동시에 두 번 저장하면 정확히 하나만 200이고 다른 하나의 409에 승자의 값이 실린다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33d');
    const base = await startRouteServer(t);
    const start = await getPalette(base, userId);

    const slotsA = [...DEFAULT_SLOTS].reverse();
    const slotsB = [...DEFAULT_SLOTS.slice(4), ...DEFAULT_SLOTS.slice(0, 4)];
    const [left, right] = await Promise.all([
        putPalette(base, userId, { slots: slotsA, expectedRevision: start.body.revision }),
        putPalette(base, userId, { slots: slotsB, expectedRevision: start.body.revision }),
    ]);

    const winners = [left, right].filter((result) => result.status === 200);
    const losers = [left, right].filter((result) => result.status === 409);
    assert.equal(winners.length, 1, '같은 revision을 쓴 두 저장 중 정확히 하나만 통과해야 한다');
    assert.equal(losers.length, 1);
    assert.equal(losers[0].body.code, 'REVISION_MISMATCH');
    assert.equal(losers[0].body.revision, winners[0].body.revision);
    assert.deepEqual(losers[0].body.slots, winners[0].body.slots);

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, winners[0].body.slots);
    assert.equal(after.body.revision, winners[0].body.revision);
});

test('AC-04: 소유하지 않은 itemId가 섞이면 NOT_OWNED로 거부되고 팔레트는 한 칸도 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33e');
    const base = await startRouteServer(t);
    const before = await getPalette(base, userId);

    const notOwned = [...DEFAULT_SLOTS];
    notOwned[3] = 'emoji-take-aim';

    const rejected = await putPalette(base, userId, { slots: notOwned, expectedRevision: before.body.revision });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, 'NOT_OWNED');

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, before.body.slots);
    assert.equal(after.body.revision, before.body.revision, '거부된 저장은 revision도 소모하지 않는다');
});

test('AC-04: 팔레트 행이 아직 없는 계정이 미소유 itemId를 저장하려 해도 기본 배치만 남고 그 값은 저장되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33f');
    const base = await startRouteServer(t);
    assert.equal(await paletteRow(userId), null);

    const rejected = await putPalette(base, userId, {
        slots: [...DEFAULT_SLOTS.slice(0, 7), 'emoji-shush'],
        expectedRevision: crypto.randomUUID(),
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, 'NOT_OWNED');

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, DEFAULT_SLOTS);
});

test('AC-05: 길이·중복·형식이 어긋난 slots는 전부 INVALID_SLOTS로 거부되고 팔레트가 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33g');
    const base = await startRouteServer(t);
    const before = await getPalette(base, userId);
    const expectedRevision = before.body.revision;

    const invalidSlots = [
        DEFAULT_SLOTS.slice(0, 7),
        [...DEFAULT_SLOTS, 'emoji-basic-reject'],
        [...DEFAULT_SLOTS.slice(0, 7), 'emoji-basic-reject'],
        [...DEFAULT_SLOTS.slice(0, 7), 42],
        [...DEFAULT_SLOTS.slice(0, 7), { id: 'emoji-basic-dizzy' }],
        [...DEFAULT_SLOTS.slice(0, 7), ''],
        'emoji-basic-reject',
    ];

    for (const slots of invalidSlots) {
        // eslint-disable-next-line no-await-in-loop -- 각 거부 뒤에 팔레트가 그대로인지 순서대로 확인한다.
        const rejected = await putPalette(base, userId, { slots, expectedRevision });
        assert.equal(rejected.status, 400, `${JSON.stringify(slots)}는 400이어야 한다`);
        assert.equal(rejected.body.code, 'INVALID_SLOTS', `${JSON.stringify(slots)}는 INVALID_SLOTS여야 한다`);
    }

    const invalidRevisions = [undefined, null, 42, ['r'], { revision: 'r' }, ''];
    for (const badRevision of invalidRevisions) {
        // eslint-disable-next-line no-await-in-loop -- 위와 같은 이유.
        const rejected = await putPalette(base, userId, { slots: DEFAULT_SLOTS, expectedRevision: badRevision });
        assert.equal(rejected.status, 400, `expectedRevision=${JSON.stringify(badRevision)}는 400이어야 한다`);
        assert.equal(rejected.body.code, 'MISSING_EXPECTED_REVISION');
    }

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, before.body.slots);
    assert.equal(after.body.revision, expectedRevision, '거부된 요청은 revision을 바꾸지 않는다');
});

test('AC-05: 빈 칸(null)은 정상 값이라 8칸 전부 null이든 일부만 null이든 저장되고 그대로 다시 읽힌다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33h');
    const base = await startRouteServer(t);
    let current = await getPalette(base, userId);

    const allNull = [null, null, null, null, null, null, null, null];
    const saved = await putPalette(base, userId, { slots: allNull, expectedRevision: current.body.revision });
    assert.equal(saved.status, 200, '빈 칸끼리는 중복으로 판정하지 않는다');
    assert.deepEqual(saved.body.slots, allNull);

    current = await getPalette(base, userId);
    assert.deepEqual(current.body.slots, allNull);

    const mixed = ['emoji-basic-reject', null, 'emoji-basic-anger', null, null, 'emoji-basic-hello', null, null];
    const savedMixed = await putPalette(base, userId, { slots: mixed, expectedRevision: current.body.revision });
    assert.equal(savedMixed.status, 200);

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, mixed);
    assert.equal(after.body.revision, savedMixed.body.revision);
});

test('AC-06: slots·expectedRevision 외의 필드가 섞이면 400으로 거부되고 팔레트가 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('f33i');
    const base = await startRouteServer(t);
    const before = await getPalette(base, userId);

    const rejected = await putPalette(base, userId, {
        slots: [...DEFAULT_SLOTS].reverse(),
        expectedRevision: before.body.revision,
        userId: 'someone-else',
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, 'INVALID_FIELDS');

    const after = await getPalette(base, userId);
    assert.deepEqual(after.body.slots, before.body.slots);
    assert.equal(after.body.revision, before.body.revision);
});

test('AC-07: 서로 다른 토큰은 각자 자기 팔레트만 읽고 쓴다(다른 계정의 팔레트는 영향받지 않는다)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const alice = await createLocalUser('f33j');
    const bob = await createLocalUser('f33k');
    const base = await startRouteServer(t);

    const aliceBefore = await getPalette(base, alice);
    const bobBefore = await getPalette(base, bob);
    assert.notEqual(aliceBefore.body.revision, bobBefore.body.revision, '계정마다 별도의 revision을 갖는다');

    const aliceSlots = [...DEFAULT_SLOTS].reverse();
    const saved = await putPalette(base, alice, { slots: aliceSlots, expectedRevision: aliceBefore.body.revision });
    assert.equal(saved.status, 200);

    const bobAfter = await getPalette(base, bob);
    assert.deepEqual(bobAfter.body.slots, DEFAULT_SLOTS, '다른 계정의 저장이 내 팔레트를 바꾸면 안 된다');
    assert.equal(bobAfter.body.revision, bobBefore.body.revision);

    const crossed = await putPalette(base, bob, { slots: aliceSlots, expectedRevision: aliceBefore.body.revision });
    assert.equal(crossed.status, 409);
    assert.equal(crossed.body.code, 'REVISION_MISMATCH');

    const aliceAfter = await getPalette(base, alice);
    assert.deepEqual(aliceAfter.body.slots, aliceSlots);
    assert.equal(aliceAfter.body.revision, saved.body.revision);
});

test('AC-08: 0019 마이그레이션의 up()을 반복 실행해도 오류 없이 끝나고 스키마 계약이 그대로다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const queryInterface = sequelize.getQueryInterface();
    await assert.doesNotReject(() => addEmojiPalettes.up(queryInterface, Sequelize));
    await assert.doesNotReject(() => addEmojiPalettes.up(queryInterface, Sequelize));
    await assert.doesNotReject(() => addEmojiPalettes.verify(queryInterface));

    const userId = await createLocalUser('f33l');
    const base = await startRouteServer(t);
    const before = await getPalette(base, userId);
    await addEmojiPalettes.up(queryInterface, Sequelize);
    const after = await getPalette(base, userId);
    assert.equal(after.body.revision, before.body.revision);
    assert.deepEqual(after.body.slots, before.body.slots);

    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, [], '이미 적용된 마이그레이션은 다시 실행되지 않아야 한다');
});
