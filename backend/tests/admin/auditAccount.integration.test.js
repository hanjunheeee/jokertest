'use strict';

// 관리자 기록·계정 명령·정리 통합 시험 (AD-030·031·034), 진짜 시험 DB
// npm run test:with-db -- tests/admin/auditAccount.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const { prepareAdminDb, createTestAdmin, otpNow, setEnv, TEST_TOTP_KEY, TEST_ORIGIN } = require('./helpers/adminTestApp');

let dbHandle = null;
let restoreEnv = () => {};
test.before(async () => {
    restoreEnv = setEnv({ ADMIN_TOTP_KEY: TEST_TOTP_KEY, ADMIN_ORIGIN: TEST_ORIGIN, ADMIN_ACCESS_MODE: 'off' });
    dbHandle = await prepareAdminDb();
});
test.after(async () => {
    restoreEnv();
    if (dbHandle) await dbHandle.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const audit = require('../../admin/services/core/audit');
const { AUDIT_ACTIONS, AUDIT_KINDS } = require('../../admin/services/core/auditActions');
const accounts = require('../../admin/scripts/admin-account');
const { login } = require('../../admin/services/core/login');
const secretBox = require('../../admin/services/core/secretBox');

const fakeReq = (adminId) => ({ admin: { id: adminId }, adminRequestMeta: { ip: '203.0.113.7', accessEmail: 'boss@example.com' } });

test('AD-030: 동작 이름 표 = 설계 5-4 전부, 이력 묶음', () => {
    assert.deepEqual(Object.keys(AUDIT_ACTIONS).sort(), [
        'ADMIN_LOGIN', 'ADMIN_LOGOUT', 'ANNOUNCE', 'BAN', 'BANNED_WORD_ADD', 'BANNED_WORD_TOGGLE', 'BAN_UPDATE',
        'COUPON_CREATE', 'COUPON_TOGGLE', 'FORCE_DISCONNECT', 'INQUIRY_REPLY', 'MAINTENANCE_FORCE_END', 'MAINTENANCE_UPDATE',
        'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'REFUND', 'REPORT_DISMISS', 'REPORT_RESOLVE', 'TERMS_CREATE', 'UNBAN',
        'VIEW_EVIDENCE', 'VIEW_PII', 'WALLET_ADJUST',
    ].sort());
    for (const [name, value] of Object.entries(AUDIT_ACTIONS)) assert.equal(value, name);
    assert.deepEqual(AUDIT_KINDS.announce, ['ANNOUNCE']);
    assert.deepEqual(AUDIT_KINDS.sanction, ['FORCE_DISCONNECT', 'BAN', 'BAN_UPDATE', 'UNBAN', 'REPORT_RESOLVE']);
    assert.ok(Object.isFrozen(AUDIT_ACTIONS) && Object.isFrozen(AUDIT_KINDS.sanction));
});

test('AD-030: 기록 한 줄 — 누가·무엇·대상·전후·사유·IP·Access 이메일·요청 번호, 비번·OTP·쿠키·토큰 칸은 빠짐', async (t) => {
    if (skipWithoutDb(t)) return;
    const admin = await createTestAdmin();
    const requestId = crypto.randomUUID();
    const { id } = await audit.record({
        req: fakeReq(admin.id),
        action: AUDIT_ACTIONS.BAN,
        targetType: 'user',
        targetId: 'u-1',
        before: { banned: false, password: 'pw', nested: { otp: '123456', keep: 1, sessionCookie: 'c' } },
        after: { banned: true, days: 7, accessToken: 'tok', items: [{ csrfToken: 'x', ok: true }], totpSecret: 's' },
        reason: '욕설 반복',
        requestId,
    });
    const row = await db().AdminAuditLog.findByPk(id, { raw: true });
    assert.equal(row.admin_id, admin.id);
    assert.equal(row.action, 'BAN');
    assert.equal(row.target_type, 'user');
    assert.equal(row.target_id, 'u-1');
    assert.equal(row.reason, '욕설 반복');
    assert.equal(row.ip, '203.0.113.7');
    assert.equal(row.access_email, 'boss@example.com');
    assert.equal(row.request_id, requestId);
    const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
    assert.deepEqual(parse(row.before_value), { banned: false, nested: { keep: 1 } });
    assert.deepEqual(parse(row.after_value), { banned: true, days: 7, items: [{ ok: true }] });
});

test('AD-030: 트랜잭션 롤백되면 기록도 없음, 모르는 동작·관리자 없음은 던짐', async (t) => {
    if (skipWithoutDb(t)) return;
    const admin = await createTestAdmin();
    const marker = crypto.randomUUID();
    await assert.rejects(db().sequelize.transaction(async (transaction) => {
        await audit.record({ req: fakeReq(admin.id), action: AUDIT_ACTIONS.UNBAN, targetType: 'user', targetId: marker }, { transaction });
        throw new Error('뒤 일이 실패');
    }), /뒤 일이 실패/);
    assert.equal(await db().AdminAuditLog.count({ where: { target_id: marker } }), 0);

    await db().sequelize.transaction(async (transaction) => {
        await audit.record({ req: fakeReq(admin.id), action: AUDIT_ACTIONS.UNBAN, targetType: 'user', targetId: marker }, { transaction });
    });
    assert.equal(await db().AdminAuditLog.count({ where: { target_id: marker } }), 1);

    await assert.rejects(audit.record({ req: fakeReq(admin.id), action: 'DROP_EVERYTHING' }), /동작/);
    await assert.rejects(audit.record({ req: {}, action: AUDIT_ACTIONS.BAN }), /관리자/);
    // 관리자 없이 도는 일(점검 강제 종료)은 adminId를 직접
    const forced = await audit.record({ adminId: admin.id, action: AUDIT_ACTIONS.MAINTENANCE_FORCE_END, after: { node: 'n1', games: 2 } });
    assert.ok(forced.id);
});

test('AD-031: create — bcrypt 비번·OTP 비밀 잠금·SUPER·이메일 소문자, otpauth 주소 한 번 돌려줌', async (t) => {
    if (skipWithoutDb(t)) return;
    const made = await accounts.createAdminAccount({ loginId: 'ceo-one', email: 'CEO@Example.com', password: 'long-enough-pass' });
    assert.match(made.totpSecret, /^[A-Z2-7]{32}$/);
    assert.match(made.otpauthUrl, /^otpauth:\/\/totp\//);
    const row = await db().AdminUser.findByPk(made.id, { raw: true });
    assert.equal(row.login_id, 'ceo-one');
    assert.equal(row.email, 'ceo@example.com');
    assert.equal(row.role, 'SUPER');
    assert.equal(Boolean(row.is_active), true);
    assert.match(row.password_hash, /^\$2[aby]\$10\$/);
    assert.equal(await bcrypt.compare('long-enough-pass', row.password_hash), true);
    assert.match(row.totp_secret, /^v1:/);
    assert.equal(secretBox.open(row.totp_secret, Buffer.from(TEST_TOTP_KEY, 'hex')), made.totpSecret);
    assert.ok(row.password_changed_at);
});

test('AD-031: create 거절 — 같은 아이디·같은 이메일·12자 미만 비번·이상한 아이디·이메일', async (t) => {
    if (skipWithoutDb(t)) return;
    await accounts.createAdminAccount({ loginId: 'cto-one', email: 'cto@example.com', password: 'long-enough-pass' });
    const reject = (input, code) => assert.rejects(accounts.createAdminAccount(input), (error) => error.code === code);
    await reject({ loginId: 'cto-one', email: 'other@example.com', password: 'long-enough-pass' }, 'ADMIN_EXISTS');
    await reject({ loginId: 'cto-two', email: 'CTO@example.com', password: 'long-enough-pass' }, 'ADMIN_EXISTS');
    await reject({ loginId: 'cto-three', email: 'cto3@example.com', password: 'short-pass' }, 'PASSWORD_TOO_SHORT');
    await reject({ loginId: 'a b', email: 'x@example.com', password: 'long-enough-pass' }, 'INVALID_INPUT');
    await reject({ loginId: 'cto-four', email: 'not-an-email', password: 'long-enough-pass' }, 'INVALID_INPUT');
    assert.equal(await db().AdminUser.count({ where: { login_id: ['cto-two', 'cto-three', 'cto-four'] } }), 0);
});

// 지금 시각으로 로그인 (서비스 바로)
const loginNow = (account, extra = {}) => login({
    loginId: account.loginId, password: account.password, otp: otpNow(account.totpSecret),
    ip: '198.51.100.9', accessEmail: null, userAgent: 'cli-test', ...extra,
});

test('AD-031: reset-otp — 새 비밀, 옛 번호 안 됨, 세션 끊김', async (t) => {
    if (skipWithoutDb(t)) return;
    const admin = await createTestAdmin();
    await loginNow(admin);
    const fresh = await accounts.resetAdminOtp({ loginId: admin.loginId });
    assert.notEqual(fresh.totpSecret, admin.totpSecret);
    const sessions = await db().AdminSession.findAll({ where: { admin_id: admin.id }, raw: true });
    assert.ok(sessions.length > 0 && sessions.every((row) => row.revoked_at), '세션 전부 끊김');
    const row = await db().AdminUser.findByPk(admin.id, { raw: true });
    assert.equal(row.totp_last_step, null);
    await assert.rejects(loginNow({ ...admin, totpSecret: admin.totpSecret }), (error) => error.code === 'ADMIN_LOGIN_FAILED');
    const ok = await loginNow({ ...admin, totpSecret: fresh.totpSecret }, { ip: '198.51.100.10' });
    assert.equal(ok.admin.id, admin.id);
});

test('AD-031: reset-password · disable(세션 끊김) · enable · unlock · list(비밀 없음)', async (t) => {
    if (skipWithoutDb(t)) return;
    const admin = await createTestAdmin();
    await accounts.resetAdminPassword({ loginId: admin.loginId, password: 'brand-new-password' });
    await assert.rejects(accounts.resetAdminPassword({ loginId: admin.loginId, password: 'short' }), (error) => error.code === 'PASSWORD_TOO_SHORT');
    const renewed = { ...admin, password: 'brand-new-password' };
    await loginNow(renewed);

    await accounts.setAdminActive({ loginId: admin.loginId, active: false });
    const sessions = await db().AdminSession.findAll({ where: { admin_id: admin.id }, raw: true });
    assert.ok(sessions.every((row) => row.revoked_at), 'disable이면 세션 끊김');
    await accounts.setAdminActive({ loginId: admin.loginId, active: true });
    assert.equal(Boolean((await db().AdminUser.findByPk(admin.id, { raw: true })).is_active), true);

    // 5번 틀려 잠긴 뒤 unlock하면 바로 됨
    for (let i = 0; i < 5; i += 1) {
        await assert.rejects(loginNow({ ...renewed, password: 'wrong-password-xx' }, { ip: `198.51.100.${20 + i}` }));
    }
    // 앞 성공과 다른 OTP 칸이 되게 1분 뒤 시계로
    const laterMs = Date.now() + 60 * 1000;
    const later = { otp: otpNow(renewed.totpSecret, laterMs), now: new Date(laterMs) };
    await assert.rejects(loginNow(renewed, { ...later, ip: '198.51.100.30' }), (error) => error.code === 'ADMIN_LOGIN_LOCKED');
    await accounts.unlockAdmin({ loginId: admin.loginId });
    const ok = await loginNow(renewed, { ...later, ip: '198.51.100.31' });
    assert.equal(ok.admin.id, admin.id);

    const listed = await accounts.listAdmins();
    const mine = listed.find((item) => item.loginId === admin.loginId);
    assert.ok(mine);
    assert.deepEqual(Object.keys(mine).sort(), ['active', 'email', 'lastLoginAt', 'loginId', 'role'].sort());
    assert.doesNotMatch(JSON.stringify(listed), /\$2[aby]\$|v1:/);

    await assert.rejects(accounts.unlockAdmin({ loginId: 'nobody-x' }), (error) => error.code === 'ADMIN_NOT_FOUND');
});

test('AD-031: 명령 줄 — create는 비번 두 번 물음(다르면 멈춤), 비밀은 출력 한 번, 모르는 명령은 쓰는 법', async (t) => {
    if (skipWithoutDb(t)) return;
    const printed = [];
    const io = (answers) => ({ askHidden: async () => answers.shift(), print: (line) => printed.push(line) });
    const mismatch = await accounts.runCommand(['create', '--login', 'cli-boss', '--email', 'cli@example.com'], io(['long-enough-pass', 'different-pass!!']));
    assert.equal(mismatch, 1);
    assert.equal(await db().AdminUser.count({ where: { login_id: 'cli-boss' } }), 0);

    printed.length = 0;
    const code = await accounts.runCommand(['create', '--login', 'cli-boss', '--email', 'cli@example.com'], io(['long-enough-pass', 'long-enough-pass']));
    assert.equal(code, 0);
    const output = printed.join('\n');
    assert.match(output, /otpauth:\/\/totp\//);
    assert.doesNotMatch(output, /long-enough-pass/);
    assert.equal(await db().AdminUser.count({ where: { login_id: 'cli-boss' } }), 1);

    printed.length = 0;
    assert.equal(await accounts.runCommand(['what'], io([])), 1);
    assert.match(printed.join('\n'), /admin:account/);
});

test('AD-034: 정리 — 끝난 세션·90일 지난 시도·90일 지난 증거 지움, 나머지는 남김', async (t) => {
    if (skipWithoutDb(t)) return;
    const { runAdminCleanup } = require('../../admin/services/core/cleanup');
    const now = new Date();
    const ago = (ms) => new Date(now.getTime() - ms);
    const DAY = 24 * 60 * 60 * 1000;
    const admin = await createTestAdmin();
    const session = (label, fields) => db().AdminSession.create({
        id: crypto.createHash('sha256').update(`${label}-${admin.id}`).digest('hex'),
        admin_id: admin.id, created_at: ago(DAY), last_seen_at: now, expires_at: new Date(now.getTime() + DAY), ...fields,
    });
    await session('live', {});
    await session('expired', { expires_at: ago(1000) });
    await session('revoked', { revoked_at: ago(1000) });
    await session('idle', { last_seen_at: ago(31 * 60 * 1000) });

    const attempt = (loginId, createdAt) => db().AdminLoginAttempt.create({ login_id: loginId, ip: '1.2.3.4', ok: false, failure_code: 'BAD_CREDENTIALS', created_at: createdAt });
    await attempt('old-attempt', ago(91 * DAY));
    await attempt('new-attempt', ago(10 * DAY));

    const user = async (tag) => db().User.create({ uuid: crypto.randomUUID(), password_hash: 'x', nickname: `n${tag}${Date.now() % 100000}`, email: `${tag}${Date.now()}@example.com` });
    const reporter = await user('r');
    const target = await user('t');
    const report = await db().Report.create({ reporter_id: reporter.uuid, target_id: target.uuid, game_id: 'g-clean', reason_code: 'ABUSE' });
    await db().ReportChatEvidence.create({ report_id: report.id, game_id: 'g-clean', messages: [], saved_at: ago(91 * DAY) });
    await db().ReportChatEvidence.create({ report_id: report.id, game_id: 'g-clean', messages: [], saved_at: ago(DAY) });

    const result = await runAdminCleanup({ now });
    // 앞 시험이 끊은 세션도 같이 지워짐 → 적어도 3, 이 관리자 것은 아래에서 하나만 남음
    assert.ok(result.sessions >= 3);
    assert.ok(result.attempts >= 1);
    assert.equal(result.evidence, 1);

    const left = await db().AdminSession.findAll({ where: { admin_id: admin.id }, raw: true });
    assert.equal(left.length, 1);
    assert.equal(await db().AdminLoginAttempt.count({ where: { login_id: 'old-attempt' } }), 0);
    assert.equal(await db().AdminLoginAttempt.count({ where: { login_id: 'new-attempt' } }), 1);
    assert.equal(await db().ReportChatEvidence.count({ where: { report_id: report.id } }), 1);
    assert.equal(await db().Report.count({ where: { id: report.id } }), 1, '신고 줄은 남김');
});
