'use strict';

// F-08 지갑·거래·카탈로그·소유권 — 실제 MySQL 격리 DB 검증. f01~f07과 같은 원칙을
// 따른다: F08_TEST_DATABASE_URL이 없거나 연결에 실패하면 실패가 아니라 t.skip으로
// "미검증"을 남긴다. f01~f07이 공유하는 pluto_f01_20260909_al과는 별도의 전용 DB를
// 쓴다 — economy_* 4개 테이블은 마이그레이션 파일이 아니라 sequelize.sync()로 생성되는
// 신규 모델이라(backend/models/economy/economy.model.js), f01~f07이 쓰는
// backend/tests/helpers/isolatedTestDb.js의 마이그레이션 기반 관리 목록에 끼워 넣지
// 않고 이 파일 안에서 스스로 안전 확인·리셋을 책임진다(공유 헬퍼·다른 스위트에 영향 없음).
//
// backend/service/economy.service.test.js가 인메모리 fake db로 이미 검증한 AC-01·
// AC-02·AC-03·AC-04·AC-05의 "로직"은 여기서 다시 따지지 않는다. 이 파일의 목적은 그
// 로직이 실제 MySQL의 SELECT ... FOR UPDATE 행 잠금·UNIQUE 제약 위에서도 그대로
// 성립하는지(진짜 DB 트랜잭션 경계) 하나만 확인하는 것이다.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F08_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f08-economy-integration-test-secret';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');

const ECONOMY_TABLES = ['economy_ledger_entries', 'economy_entitlements', 'economy_wallets', 'economy_loadouts'];
const DROP_ORDER = [...ECONOMY_TABLES, ...[...baseline.TABLE_ORDER].reverse(), migrationRunner.META_TABLE];

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
        t.skip('F08_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB(${TEST_DB_URL.replace(/:[^:@]*@/, ':***@')})에 연결할 수 없습니다 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

// f01의 ALLOWED_DATABASE_NAMES와 같은 취지 — URL 이름 자체에 f08/economy가 없으면
// destructive reset을 거부해, 실수로 공유 DB를 가리키는 사고를 막는다.
const assertDedicatedDatabase = () => {
    const name = new URL(TEST_DB_URL).pathname.replace(/^\//, '');
    if (!/f08|economy/i.test(name)) {
        throw new Error(`전용 테스트 DB로 보이지 않습니다: [${name}] — 이름에 f08 또는 economy가 포함돼야 합니다.`);
    }
};

const resetSchema = async () => {
    assertDedicatedDatabase();
    const queryInterface = sequelize.getQueryInterface();
    const existing = new Set(await queryInterface.showAllTables());
    for (const table of DROP_ORDER) {
        if (existing.has(table)) await queryInterface.dropTable(table);
    }
};

// require 캐시 싱글턴이라 DATABASE_URL(F08_TEST_DATABASE_URL)로 처음 require되는 이
// 시점에 격리 DB에 연결된다 — 실제 프로덕션 경로(economyService → backend/models)를
// 그대로 태운다.
const db = require('../../models');
const economyService = require('../../service/economy.service');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname: `${label}${uuid.slice(0, 6)}`,
        email: `${label}-${uuid}@example.com`,
    });
    return uuid;
};

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: [baseline] });
    // economy_* 4개 테이블은 마이그레이션이 아니라 모델 정의로만 존재한다 — 실제
    // 서버 기동(backend/index.js)과 같은 방식(sync({force:false}))으로 만든다.
    await db.sequelize.sync({ force: false });
};

test('AC-01: 실제 MySQL 행 잠금 아래 동일 계정·동일 상품 동시 구매는 한 번만 차감된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac01');
    await economyService.grantReward({ userId, amountGold: 1000, reason: 'TEST_SEED', referenceEventId: `seed-${userId}` });

    const results = await Promise.allSettled([
        economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `a-${userId}` }),
        economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `b-${userId}` }),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 800);

    const [[{ ledgerSum }]] = await db.sequelize.query(
        'SELECT COALESCE(SUM(amount), 0) AS ledgerSum FROM economy_ledger_entries WHERE user_id = :userId',
        { replacements: { userId } },
    );
    assert.equal(Number(ledgerSum), wallet.balance_gold);
});

test('AC-02: 같은 참조 사건 ID로 재전송해도 유일 제약이 중복 지급을 막는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac02');
    const referenceEventId = `retry-${userId}`;
    const first = await economyService.grantReward({ userId, amountGold: 100, referenceEventId });
    const second = await economyService.grantReward({ userId, amountGold: 100, referenceEventId });

    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 100);
});

test('AC-03: 실제 DB에서도 기본 프로필 16종 + 평민 테두리 1종이 중복 없이 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac03');
    const summary = await economyService.getWalletSummary(userId);

    assert.equal(summary.entitlements.length, 17);
    assert.equal(new Set(summary.entitlements.map((e) => e.itemId)).size, 17);
});
