'use strict';

// 신고 처리 통합 시험 (AD-120~124), 진짜 시험 DB + 관리자 라우터(로그인된 시험 앱)
// npm run test:with-db -- tests/admin/reports.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-reports-integration-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp, createAgent, otpNow } = require('./helpers/adminTestApp');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const disconnectModule = require('../../services/ops/disconnect');
const tagOf = () => crypto.randomBytes(3).toString('hex');

const makeMember = async (prefix) => {
    const tag = tagOf();
    return db().User.create({ uuid: crypto.randomUUID(), password_hash: 'x', nickname: `${prefix}${tag}`, email: `rp-${tag}@example.com` });
};

// 신고 하나 (+ 채팅 증거 있으면 같이) → { report, reporter, target }
const makeReport = async ({ messages, target } = {}) => {
    const reporter = await makeMember('신고자');
    const who = target ?? await makeMember('대상');
    const gameId = crypto.randomUUID();
    const report = await db().Report.create({ reporter_id: reporter.uuid, target_id: who.uuid, game_id: gameId, reason_code: 'ABUSE', memo: '욕함' });
    if (messages) await db().ReportChatEvidence.create({ report_id: report.id, game_id: gameId, messages });
    return { report, reporter, target: who };
};

// 끊기를 가짜로 (소켓 서버 없이 누구를 끊었는지만 봄)
const stubDisconnect = (t) => t.mock.method(disconnectModule, 'disconnectUser', async (uuid) => ({ uuid, code: 'ACCOUNT_BANNED', disconnected: 1 }));

const auditOf = (action, targetId) => db().AdminAuditLog.findAll({ where: { action, target_id: String(targetId) }, raw: true });

test('AD-120: 목록 상태별·50줄 커서, 상세 증거 시각순 + VIEW_EVIDENCE', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const messages = [
        { at: '2026-11-10T03:00:02.000Z', channel: 'MAFIA', senderUuid: 'u2', nickname: '나쁜', text: '둘째' },
        { at: '2026-11-10T03:00:01.000Z', channel: 'ALL', senderUuid: 'u1', nickname: '나쁜', text: '첫째' },
    ];
    const { report, target } = await makeReport({ messages });
    await makeReport();

    const open = await agent.get('/admin-api/reports?status=OPEN&limit=1');
    assert.equal(open.status, 200);
    assert.equal(open.body.items.length, 1);
    assert.ok(open.body.nextBefore);
    assert.ok(open.body.items.every((item) => item.status === 'OPEN'));
    const next = await agent.get(`/admin-api/reports?status=OPEN&limit=50&before=${open.body.nextBefore}`);
    assert.ok(next.body.items.every((item) => item.id < open.body.nextBefore));
    const bad = await agent.get('/admin-api/reports?status=NOPE');
    assert.equal(bad.status, 400);

    const detail = await agent.get(`/admin-api/reports/${report.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.report.target.uuid, target.uuid);
    assert.equal(detail.body.report.target.nickname, target.nickname);
    assert.equal(detail.body.report.memo, '욕함');
    assert.deepEqual(detail.body.evidence.messages.map((m) => [m.channel, m.text]), [['ALL', '첫째'], ['MAFIA', '둘째']]);
    assert.equal(detail.body.targetHistory.reportCount, 1);
    const logs = await auditOf('VIEW_EVIDENCE', report.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].admin_id, admin.id);

    const missing = await agent.get('/admin-api/reports/999999999');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'REPORT_NOT_FOUND');
});

test('AD-121: 처리(정지) → RESOLVED·처리한 사람·시각 + 정지 줄 + 끊김 + 기록 둘', async (t) => {
    if (skipWithoutDb(t)) return;
    const disconnect = stubDisconnect(t);
    const { agent, admin } = await adminTestApp({ t });
    const { report, target } = await makeReport();

    const res = await agent.post(`/admin-api/reports/${report.id}/resolve`, { ban: { kind: 'PERIOD', days: 7, reason: '욕설' }, memo: '증거 확인' });

    assert.equal(res.status, 200);
    assert.equal(res.body.report.status, 'RESOLVED');
    assert.equal(res.body.report.handledBy, admin.loginId);
    assert.ok(res.body.report.handledAt);
    assert.equal(res.body.ban.isPermanent, false);
    assert.equal(res.body.disconnect.disconnected, 1);
    assert.deepEqual(disconnect.mock.calls.map((call) => call.arguments[0]), [target.uuid]);
    const row = await db().Report.findByPk(report.id, { raw: true });
    assert.equal(row.status, 'RESOLVED');
    assert.equal(row.handled_by_admin_id, admin.id);
    const bans = await db().UserBan.findAll({ where: { user_id: target.uuid }, raw: true });
    assert.equal(bans.length, 1);
    assert.equal(bans[0].reason, '욕설');
    assert.equal((await auditOf('REPORT_RESOLVE', report.id)).length, 1);
    assert.equal((await auditOf('BAN', target.uuid)).length, 1);
});

test('AD-121: 정지 실패(이미 정지 중) → 409 ALREADY_BANNED, 신고는 OPEN 그대로·기록 없음', async (t) => {
    if (skipWithoutDb(t)) return;
    stubDisconnect(t);
    const { agent } = await adminTestApp({ t });
    const first = await makeReport();
    const second = await makeReport({ target: first.target });
    const ok = await agent.post(`/admin-api/reports/${first.report.id}/resolve`, { ban: { kind: 'PERMANENT', reason: '도배' } });
    assert.equal(ok.status, 200);

    const again = await agent.post(`/admin-api/reports/${second.report.id}/resolve`, { ban: { kind: 'PERIOD', days: 1, reason: '도배' } });

    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'ALREADY_BANNED');
    const row = await db().Report.findByPk(second.report.id, { raw: true });
    assert.equal(row.status, 'OPEN');
    assert.equal(row.handled_by_admin_id, null);
    assert.equal((await auditOf('REPORT_RESOLVE', second.report.id)).length, 0);

    const noReason = await agent.post(`/admin-api/reports/${second.report.id}/resolve`, { ban: { kind: 'PERIOD', days: 1, reason: '  ' } });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, 'REASON_REQUIRED');
});

test('AD-122: 기각 → DISMISSED, 정지 없음, 기록 REPORT_DISMISS', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const { report, target } = await makeReport();

    const res = await agent.post(`/admin-api/reports/${report.id}/dismiss`, { memo: '오해' });

    assert.equal(res.status, 200);
    assert.equal(res.body.report.status, 'DISMISSED');
    assert.equal(await db().UserBan.count({ where: { user_id: target.uuid } }), 0);
    const logs = await auditOf('REPORT_DISMISS', report.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].reason, '오해');
});

test('AD-123: 관리자 둘이 동시에 처리 → 하나만, 다른 쪽 409 REPORT_ALREADY_HANDLED(누가·언제)', async (t) => {
    if (skipWithoutDb(t)) return;
    stubDisconnect(t);
    const first = await adminTestApp({ t });
    // 같은 시험 서버에 둘째 관리자 로그인
    const { createTestAdmin } = require('./helpers/adminTestApp');
    const otherAccount = await createTestAdmin();
    const other = createAgent({ url: first.url, ip: '10.9.9.9' });
    const login = await other.post('/admin-api/auth/login', { loginId: otherAccount.loginId, password: otherAccount.password, otp: otpNow(otherAccount.totpSecret) });
    assert.equal(login.status, 200);
    other.csrfToken = login.body.csrfToken;
    const { report } = await makeReport();

    const [a, b] = await Promise.all([
        first.agent.post(`/admin-api/reports/${report.id}/resolve`, { ban: { kind: 'PERIOD', days: 3, reason: '욕설' } }),
        other.post(`/admin-api/reports/${report.id}/dismiss`, {}),
    ]);

    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const lost = a.status === 409 ? a : b;
    const won = a.status === 409 ? b : a;
    assert.equal(lost.body.code, 'REPORT_ALREADY_HANDLED');
    assert.equal(lost.body.handledBy, won.body.report.handledBy);
    assert.ok(lost.body.handledAt);
    const row = await db().Report.findByPk(report.id, { raw: true });
    assert.equal(row.status, won.body.report.status);
});

test('AD-124: 증거 없는 신고 → evidence null', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const { report } = await makeReport();
    const detail = await agent.get(`/admin-api/reports/${report.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.evidence, null);
});
