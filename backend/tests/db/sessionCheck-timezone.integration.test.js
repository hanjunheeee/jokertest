'use strict';

// 진짜 DB 시험: 소켓 세션 확인 묶음 질의가 서버 시간대(한국)와 상관없이 정지 시작·끝 시각을 맞게 비교하는지
// 근거: docs/버그수정_결정_2026-11-09.md 2026-11-10 시간대 버그 (raw 질의에 Date 넘기면 이 PC 시간대 글자로 바뀌어 9시간 어긋남)
// 이 PC가 UTC여도 버그가 보이게 시간대를 한국으로 고정함 (Date 쓰기 전에)
process.env.TZ = 'Asia/Seoul';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'session-check-timezone-integration-secret';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addPasswordResetTokens = require('../../db/migrations/0015-password-reset-tokens');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth, addPasswordResetTokens];
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
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
        t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 DB 없이는 못 봄 (미검증)');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB 연결 실패 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const db = require('../../models');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// 사람 하나 + 세션 하나 + 정지 하나 (정지 시각은 지금 기준 몇 시간 뒤)
const makeBannedUser = async (label, startHours, endHours) => {
    const hour = 60 * 60 * 1000;
    const uuid = crypto.randomUUID();
    await db.User.create({ uuid, password_hash: 'x', nickname: `${label}${uuid.slice(0, 6)}`, email: `${label}-${uuid}@example.com` });
    const sessionId = crypto.randomUUID();
    await db.UserSession.create({ id: sessionId, user_id: uuid, is_online: true });
    await db.UserBan.create({
        user_id: uuid, reason: label,
        start_at: new Date(Date.now() + startHours * hour), end_at: new Date(Date.now() + endHours * hour),
    });
    return { uuid, sessionId };
};

test('묶음 질의(한국 시간대): 9시간 안에 끝나는 지금 정지는 막고, 9시간 안에 시작할 예약 정지는 안 막음', async (t) => {
    if (unavailable(t)) return;
    assert.equal(new Date().getTimezoneOffset(), -540, '이 시험 안 시간대는 한국(UTC+9)이어야 함');
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    // 1시간 전 시작·2시간 뒤 끝 = 지금 정지 중 → 묶음 길도 403
    const active = await makeBannedUser('activeban', -1, 2);
    const activeResult = await sessionLifecycle.resolveSession(active, { batch: true });
    assert.equal(activeResult.code, 'ACCOUNT_BANNED', `지금 정지인데 통과함: ${JSON.stringify(activeResult)}`);

    // 2시간 뒤 시작·30시간 뒤 끝 = 아직 시작 전 → 통과
    // (옛 길은 정지 모델이 0031 해제 칸까지 읽어 이 시험 마이그레이션 묶음으론 못 돌림 → 묶음 길만 봄)
    const scheduled = await makeBannedUser('futureban', 2, 30);
    assert.deepEqual(await sessionLifecycle.resolveSession(scheduled, { batch: true }), { ok: true }, '예약 정지인데 막음');
});
