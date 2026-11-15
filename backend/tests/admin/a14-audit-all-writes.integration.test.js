'use strict';

// 관리자 기록 시험: 쓰기 경로 20개마다 기록 한 줄(누가·대상·전후 값·IP·Access 이메일·요청 번호·시각)·증거 보기·거절·되돌림·비밀 칸 없음·고치기 지우기 길 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-164~190 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const H = require('./a14-ops-helpers');
const money = require('./helpers/money');
const audit = require('../../admin/services/core/audit');
const gameSettings = require('../../services/ops/gameSettings');
const maintenance = require('../../services/ops/maintenance');
const bannedWords = require('../../services/ops/bannedWords');

const { db } = H;
// Access 표까지 붙는 관리자 (기록의 Access 이메일 칸을 보려고)
const ctx = H.useAdminFile({ accessMode: 'required' });
const DAY = 24 * 60 * 60 * 1000;

const agent = () => ctx.app.agent;
const req = (method, path, body) => agent().request(method, path, { body });

// ── 준비 도우미 (이 파일만) ──

// 넣은 금지어는 끝에 지움 (공용 설정 줄)
const cleanupWord = (t, word) => t.after(async () => {
    await db.BannedWord.destroy({ where: { word } });
    await bannedWords.reloadBannedWords();
});

// 판 골드·점검 줄은 공용 설정 → 끝에 처음 모양으로
function keepSharedRows(t) {
    t.after(async () => {
        gameSettings.__setGoldRewardForTests();
        await maintenance.reloadMaintenance();
    });
}

async function addReport() {
    const reporter = await H.createPlayer('ar');
    const target = await H.createPlayer('at');
    const row = await db.Report.create({ reporter_id: reporter.uuid, target_id: target.uuid, game_id: crypto.randomUUID(), reason_code: 'ABUSE' });
    return { id: Number(row.id), target };
}

async function addInquiry() {
    const player = await H.createPlayer('aq');
    return db.Inquiry.create({ user_id: player.uuid, category: 'ACCOUNT', title: '문의', body: '도와주세요' });
}

const banOf = async (uuid) => {
    const res = await req('POST', `/admin-api/members/${uuid}/bans`, { kind: 'PERIOD', days: 7, reason: '준비 정지' });
    assert.equal(res.status, 201, `준비 정지 ${res.body?.code}`);
    return res.body.ban.id;
};

const productBody = () => ({
    productId: `a14ops-${H.tag()}`, kind: 'GOLD_PURCHASE', displayName: '시험 골드 묶음', payAmount: 10, grantAmount: 100, status: 'STOPPED',
});

// 쓰기 경로 20개: [번호, 기록 이름, 준비해서 { method, path, body, targetId, requestId? } 돌려주는 함수, 전 값이 있어야 하나]
const WRITES = [
    ['164', 'ANNOUNCE', async () => {
        const member = await H.createPlayer('a164');
        const requestId = crypto.randomUUID();
        return { method: 'POST', path: '/admin-api/announcements', body: { requestId, title: '공지', body: '본문', target: 'users', userUuids: [member.uuid] }, targetId: requestId, requestId };
    }, false],
    ['165', 'BANNED_WORD_ADD', async (t) => {
        const word = `qzaw${H.tag()}`;
        cleanupWord(t, word);
        return { method: 'POST', path: '/admin-api/banned-words', body: { word }, targetFrom: (res) => res.body.word.id };
    }, false],
    ['166', 'BANNED_WORD_TOGGLE', async (t) => {
        const word = `qzaw${H.tag()}`;
        cleanupWord(t, word);
        const made = await req('POST', '/admin-api/banned-words', { word });
        return { method: 'PATCH', path: `/admin-api/banned-words/${made.body.word.id}`, body: { isActive: false }, targetId: made.body.word.id };
    }, true],
    ['167', 'COUPON_CREATE', async () => (
        { method: 'POST', path: '/admin-api/coupons', body: { code: `AW${H.tag()}`, rewardType: 'GOLD', rewardAmount: 5 }, targetFrom: (res) => res.body.coupon.id }
    ), false],
    ['168', 'COUPON_TOGGLE', async () => {
        const made = await req('POST', '/admin-api/coupons', { code: `AW${H.tag()}`, rewardType: 'GOLD', rewardAmount: 5 });
        return { method: 'PATCH', path: `/admin-api/coupons/${made.body.coupon.id}`, body: { isActive: false }, targetId: made.body.coupon.id };
    }, true],
    ['169', 'GAME_SETTING_UPDATE', async (t) => {
        const saved = await db.GameSetting.findOne({ where: { key: 'GAME_GOLD_REWARD' }, raw: true });
        t.after(async () => {
            if (saved) await db.GameSetting.update({ value_int: saved.value_int, updated_by: saved.updated_by }, { where: { key: saved.key } });
        });
        keepSharedRows(t);
        return { method: 'PUT', path: '/admin-api/game-settings', body: { goldReward: saved?.value_int ?? 1 }, targetId: 'GAME_GOLD_REWARD' };
    }, true],
    ['170', 'INQUIRY_REPLY', async () => {
        const inquiry = await addInquiry();
        const requestId = crypto.randomUUID();
        return { method: 'POST', path: `/admin-api/inquiries/${inquiry.id}/replies`, body: { requestId, body: '답' }, targetId: inquiry.id, requestId };
    }, true],
    ['171', 'MAINTENANCE_UPDATE', async (t) => {
        const saved = await db.MaintenanceState.findOne({ where: { id: 1 }, raw: true });
        t.after(async () => {
            if (saved) await db.MaintenanceState.update(saved, { where: { id: 1 } });
            else await db.MaintenanceState.destroy({ where: { id: 1 } });
        });
        keepSharedRows(t);
        return { method: 'PUT', path: '/admin-api/maintenance', body: { enabled: false, message: null }, targetId: '1' };
    }, false],
    ['172', 'VIEW_PII', async () => {
        const member = await H.createPlayer('a172');
        return { method: 'POST', path: `/admin-api/members/${member.uuid}/reveal-email`, body: {}, targetId: member.uuid };
    }, false],
    ['173', 'REFUND', async () => {
        const member = await money.createMember('a173');
        const order = await money.createGrantedOrder(member.uuid);
        return { method: 'POST', path: `/admin-api/payments/orders/${order.order_id}/refund`, body: { reason: '잘못 결제' }, targetId: order.order_id };
    }, true],
    ['174', 'PRODUCT_CREATE', async () => {
        const body = productBody();
        return { method: 'POST', path: '/admin-api/products', body, targetId: body.productId };
    }, false],
    ['175', 'PRODUCT_UPDATE', async () => {
        const body = productBody();
        assert.equal((await req('POST', '/admin-api/products', body)).status, 201);
        return { method: 'PATCH', path: `/admin-api/products/${body.productId}`, body: { expectedVersion: 1, displayName: '바꾼 이름' }, targetId: body.productId };
    }, true],
    ['176', 'REPORT_RESOLVE', async () => {
        const report = await addReport();
        return { method: 'POST', path: `/admin-api/reports/${report.id}/resolve`, body: { ban: { kind: 'PERIOD', days: 1, reason: '욕설' } }, targetId: report.id };
    }, true],
    ['177', 'REPORT_DISMISS', async () => {
        const report = await addReport();
        return { method: 'POST', path: `/admin-api/reports/${report.id}/dismiss`, body: {}, targetId: report.id };
    }, true],
    ['178', 'FORCE_DISCONNECT', async () => {
        const member = await H.createPlayer('a178');
        return { method: 'POST', path: `/admin-api/members/${member.uuid}/force-disconnect`, body: { reason: '도배' }, targetId: member.uuid };
    }, false],
    ['179', 'BAN', async () => {
        const member = await H.createPlayer('a179');
        return { method: 'POST', path: `/admin-api/members/${member.uuid}/bans`, body: { kind: 'PERIOD', days: 3, reason: '욕설' }, targetId: member.uuid };
    }, false],
    ['180', 'BAN_UPDATE', async () => {
        const member = await H.createPlayer('a180');
        const banId = await banOf(member.uuid);
        return { method: 'PATCH', path: `/admin-api/members/${member.uuid}/bans/${banId}`, body: { kind: 'PERIOD', days: 30, reason: '늘림' }, targetId: member.uuid };
    }, true],
    ['181', 'UNBAN', async () => {
        const member = await H.createPlayer('a181');
        await banOf(member.uuid);
        return { method: 'POST', path: `/admin-api/members/${member.uuid}/unban`, body: { reason: '풀어 줌' }, targetId: member.uuid };
    }, true],
    ['182', 'TERMS_CREATE', async () => ({
        method: 'POST',
        path: '/admin-api/terms',
        body: { kind: 'TERMS', version: `a14ops-${H.tag()}`, title: '시험 약관', body: '시험 본문', url: null, effectiveAt: new Date(Date.now() + 30 * DAY).toISOString(), isRequired: false },
        targetFrom: (res) => res.body.terms.id,
    }), false],
    ['183', 'WALLET_ADJUST', async () => {
        const member = await H.createPlayer('a183');
        const requestId = crypto.randomUUID();
        return { method: 'POST', path: `/admin-api/members/${member.uuid}/wallet/adjust`, body: { requestId, currency: 'GOLD', amount: 10, reason: '보상' }, targetId: member.uuid, requestId };
    }, true],
];

// 기록 한 줄 칸 확인: 누가·이름·대상·전후 값·IP·Access 이메일·요청 번호(요청에 있을 때)·시각
function assertFilled(row, { action, targetId, requestId, hasBefore, sentAt }) {
    assert.equal(row.admin_id, ctx.app.admin.id, '누가');
    assert.equal(row.action, action);
    assert.ok(row.target_type, '대상 종류');
    assert.equal(row.target_id, String(targetId), '대상');
    assert.notEqual(row.after_value, null, '뒤 값');
    if (hasBefore) assert.notEqual(row.before_value, null, '전 값');
    assert.equal(row.ip, agent().ip, 'IP');
    assert.equal(row.access_email, ctx.app.admin.email.toLowerCase(), 'Access 이메일');
    if (requestId) assert.equal(row.request_id, requestId, '요청 번호');
    assert.ok(Math.abs(new Date(row.created_at).getTime() - sentAt) < 60_000, `시각 ${row.created_at}`);
}

for (const [no, action, prepare, hasBefore] of WRITES) {
    test(`A14-B-${no} 쓰기 → 기록 ${action} 1줄, 누가·대상·전후 값·IP·Access 이메일·요청 번호·시각 채움`, async (t) => {
        if (H.noDb(t)) return;
        const call = await prepare(t);
        const before = (await H.myAudits(ctx.app.admin, { action })).length;
        const sentAt = Date.now();
        const res = await req(call.method, call.path, call.body);
        assert.ok(res.status >= 200 && res.status < 300, `쓰기 실패 ${res.status} ${res.body?.code}`);
        const targetId = call.targetFrom ? call.targetFrom(res) : call.targetId;
        const rows = await H.myAudits(ctx.app.admin, { action });
        assert.equal(rows.length, before + 1, '기록 한 줄 더');
        assertFilled(rows.at(-1), { action, targetId, requestId: call.requestId, hasBefore, sentAt });
    });
}

test('A14-B-184 GET /reports/:id 신고 증거 보기 → VIEW_EVIDENCE 1줄', async (t) => {
    if (H.noDb(t)) return;
    const report = await addReport();
    const res = await agent().get(`/admin-api/reports/${report.id}`);
    assert.equal(res.status, 200);
    assert.equal((await H.myAudits(ctx.app.admin, { action: 'VIEW_EVIDENCE', targetId: report.id })).length, 1);
});

test('A14-B-185 PUT /game-settings { goldReward:101 } → 400, 기록 0줄', async (t) => {
    if (H.noDb(t)) return;
    const before = (await H.myAudits(ctx.app.admin)).length;
    const res = await req('PUT', '/admin-api/game-settings', { goldReward: 101 });
    assert.equal(res.status, 400);
    assert.equal((await H.myAudits(ctx.app.admin)).length, before);
});

test('A14-B-186 정지 저장 중 트랜잭션 실패 흉내(기록 쓰기가 터짐) → 정지 줄 0, 기록 0', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('a186');
    const before = (await H.myAudits(ctx.app.admin)).length;
    t.mock.method(audit, 'record', async () => { throw new Error('시험: 기록 쓰기 실패 흉내'); });
    const res = await req('POST', `/admin-api/members/${member.uuid}/bans`, { kind: 'PERIOD', days: 7, reason: '욕설' });
    t.mock.restoreAll();
    assert.ok(res.status >= 500, `상태 ${res.status}`);
    assert.equal(await db.UserBan.count({ where: { user_id: member.uuid } }), 0, '정지 줄 0');
    assert.equal((await H.myAudits(ctx.app.admin)).length, before, '기록 0');
});

test('A14-B-187 로그인·재화 주기 뒤 기록 전 줄 → 비번·OTP·쿠키·Access 표 원문 없음', async (t) => {
    if (H.noDb(t)) return;
    const member = await H.createPlayer('a187');
    const res = await req('POST', `/admin-api/members/${member.uuid}/wallet/adjust`, {
        requestId: crypto.randomUUID(), currency: 'GOLD', amount: 10, reason: '보상',
    });
    assert.equal(res.status, 200);
    const rows = await H.myAudits(ctx.app.admin);
    assert.ok(rows.some((r) => r.action === 'ADMIN_LOGIN'), '로그인 기록 있음');
    assert.ok(rows.some((r) => r.action === 'WALLET_ADJUST'), '재화 기록 있음');
    const text = JSON.stringify(rows);
    const secrets = [
        ['비번', ctx.app.admin.password],
        ['OTP 비밀', ctx.app.admin.totpSecret],
        ['세션 쿠키', agent().jar.get('mmc_admin_sid')],
        ['쓰기 확인값', agent().csrfToken],
        ['Access 표', agent().accessToken],
    ];
    for (const [label, value] of secrets) {
        assert.ok(value, `${label} 값이 시험에 있음`);
        assert.equal(text.includes(value), false, `${label} 원문이 기록에 있음`);
    }
    assert.equal(/"(password|otp|totp|cookie|sid|token)"\s*:/i.test(text), false, '비밀 칸 이름 없음');
});

// A14-B-188~190 기록 고치기·지우기 길 없음 (값 3)
for (const [no, method] of [['188', 'PUT'], ['189', 'PATCH'], ['190', 'DELETE']]) {
    test(`A14-B-${no} ${method} /admin-api/audit-logs/:id → 404, 그 줄 그대로`, async (t) => {
        if (H.noDb(t)) return;
        const [first] = await H.myAudits(ctx.app.admin);
        assert.ok(first, '내 기록 줄 있음');
        const saved = await db.AdminAuditLog.findByPk(first.id, { raw: true });
        const res = await agent().request(method, `/admin-api/audit-logs/${first.id}`, method === 'DELETE' ? {} : { body: { action: 'ADMIN_LOGOUT' } });
        assert.equal(res.status, 404);
        assert.deepEqual(await db.AdminAuditLog.findByPk(first.id, { raw: true }), saved);
    });
}
