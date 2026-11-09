'use strict';

// 관리자 전 쓰기 경로 기록 시험 (AD-300), 라우터에서 읽은 쓰기 경로를 한 번씩 성공시키고 관리자 기록이 한 줄 생기는지 봄
// npm run test:with-db -- tests/admin/allRoutes.audit.test.js (F01_TEST_DATABASE_URL 없으면 DB 부분 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp, createTestAdmin, createAgent, randomIp, otpNow } = require('./helpers/adminTestApp');
const { listAdminRoutes, fillPath } = require('./helpers/adminRoutes');
const money = require('./helpers/money');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const db = () => require('../../models');
const tag = () => crypto.randomBytes(3).toString('hex');
const HOUR = 60 * 60 * 1000;

// ── 경로마다 성공시키는 방법 ──
// prepare(ctx) → { values(경로 칸), body, agent(다른 관리자로 부를 때), adminId(기록에 남을 관리자) }
// prepare 안에서 미리 만든 것(정지·상품 등)의 기록은 기준선 앞이라 셈에서 빠짐
const memberValues = async () => ({ values: { uuid: (await money.createMember('au')).uuid } });

const banned = async (ctx) => {
    const { values } = await memberValues();
    const res = await ctx.agent.post(`/admin-api/members/${values.uuid}/bans`, { kind: 'PERIOD', days: 1, reason: '준비 정지' });
    assert.equal(res.status, 201, `준비 정지 ${res.status} ${JSON.stringify(res.body)}`);
    return { uuid: values.uuid, banId: res.body.ban?.id ?? res.body.banId };
};

const makeReport = async () => {
    const reporter = await money.createMember('rr');
    const target = await money.createMember('rt');
    return db().Report.create({ reporter_id: reporter.uuid, target_id: target.uuid, game_id: crypto.randomUUID(), reason_code: 'ABUSE', memo: '욕함' });
};

const newProduct = () => ({
    productId: `all-${tag()}`, kind: 'DIAMOND_TOPUP', displayName: '다이아 110개', payAmount: 1100, grantAmount: 100, bonusAmount: 10, sortOrder: 9,
});

const RECIPES = {
    'POST /admin-api/auth/login': {
        action: 'ADMIN_LOGIN',
        prepare: async (ctx) => {
            const account = await createTestAdmin();
            return {
                agent: createAgent({ url: ctx.url, ip: randomIp() }),
                adminId: account.id,
                body: { loginId: account.loginId, password: account.password, otp: otpNow(account.totpSecret) },
            };
        },
    },
    'POST /admin-api/auth/logout': {
        action: 'ADMIN_LOGOUT',
        prepare: async (ctx) => {
            const account = await createTestAdmin();
            const agent = createAgent({ url: ctx.url, ip: randomIp() });
            assert.equal((await agent.login(account)).status, 200);
            return { agent, adminId: account.id };
        },
    },
    'POST /admin-api/members/:uuid/wallet/adjust': {
        action: 'WALLET_ADJUST',
        prepare: async () => ({ ...(await memberValues()), body: { requestId: crypto.randomUUID(), reason: '보상', currency: 'GOLD', amount: 10 } }),
    },
    'POST /admin-api/members/:uuid/force-disconnect': {
        action: 'FORCE_DISCONNECT',
        prepare: async () => ({ ...(await memberValues()), body: { reason: '게임 멈춤' } }),
    },
    'POST /admin-api/members/:uuid/bans': {
        action: 'BAN',
        prepare: async () => ({ ...(await memberValues()), body: { kind: 'PERIOD', days: 1, reason: '욕설' } }),
    },
    'PATCH /admin-api/members/:uuid/bans/:banId': {
        action: 'BAN_UPDATE',
        prepare: async (ctx) => ({ values: await banned(ctx), body: { kind: 'PERIOD', days: 3, reason: '늘림' } }),
    },
    'POST /admin-api/members/:uuid/unban': {
        action: 'UNBAN',
        prepare: async (ctx) => ({ values: await banned(ctx), body: { reason: '이의 받아들임' } }),
    },
    'POST /admin-api/members/:uuid/reveal-email': { action: 'VIEW_PII', prepare: memberValues },
    'POST /admin-api/announcements': {
        action: 'ANNOUNCE',
        prepare: async () => ({
            body: { requestId: crypto.randomUUID(), title: '안내', body: '전 경로 시험', target: 'users', userUuids: [(await money.createMember('an')).uuid] },
        }),
    },
    'POST /admin-api/reports/:id/resolve': {
        action: 'REPORT_RESOLVE',
        prepare: async () => ({ values: { id: (await makeReport()).id }, body: { ban: { kind: 'PERIOD', days: 1, reason: '욕설' } } }),
    },
    'POST /admin-api/reports/:id/dismiss': {
        action: 'REPORT_DISMISS',
        prepare: async () => ({ values: { id: (await makeReport()).id }, body: { memo: '오해' } }),
    },
    'PUT /admin-api/maintenance': {
        action: 'MAINTENANCE_UPDATE',
        prepare: async () => ({ body: { enabled: false, message: null, startsAt: null, endsAt: null } }),
    },
    'POST /admin-api/banned-words': {
        action: 'BANNED_WORD_ADD',
        prepare: async () => ({ body: { word: `금지${tag()}` } }),
    },
    'PATCH /admin-api/banned-words/:id': {
        action: 'BANNED_WORD_TOGGLE',
        prepare: async (ctx) => {
            const made = await ctx.agent.post('/admin-api/banned-words', { word: `금지${tag()}` });
            return { values: { id: made.body.word.id }, body: { isActive: false } };
        },
    },
    'POST /admin-api/payments/orders/:orderId/refund': {
        action: 'REFUND',
        prepare: async () => {
            const member = await money.createMember('pf');
            const order = await money.createGrantedOrder(member.uuid);
            return { values: { orderId: order.order_id }, body: { reason: '결제 회사 화면에서 취소함' } };
        },
    },
    'POST /admin-api/products': { action: 'PRODUCT_CREATE', prepare: async () => ({ body: newProduct() }) },
    'PATCH /admin-api/products/:productId': {
        action: 'PRODUCT_UPDATE',
        prepare: async (ctx) => {
            const input = newProduct();
            assert.equal((await ctx.agent.post('/admin-api/products', input)).status, 201);
            return { values: { productId: input.productId }, body: { expectedVersion: 1, payAmount: 1200 } };
        },
    },
    'POST /admin-api/coupons': {
        action: 'COUPON_CREATE',
        prepare: async () => ({ body: { code: `all-${tag()}`, rewardType: 'GOLD', rewardAmount: 10 } }),
    },
    'PATCH /admin-api/coupons/:id': {
        action: 'COUPON_TOGGLE',
        prepare: async (ctx) => {
            const made = await ctx.agent.post('/admin-api/coupons', { code: `all-${tag()}`, rewardType: 'GOLD', rewardAmount: 10 });
            return { values: { id: made.body.coupon.id }, body: { isActive: false } };
        },
    },
    'POST /admin-api/terms': {
        action: 'TERMS_CREATE',
        prepare: async () => ({
            body: {
                kind: 'TERMS', version: `9.${Date.now()}.${tag()}`, title: '이용약관 개정', body: '새 본문', url: null,
                effectiveAt: new Date(Date.now() + HOUR).toISOString(), isRequired: true,
            },
        }),
    },
    'POST /admin-api/inquiries/:id/replies': {
        action: 'INQUIRY_REPLY',
        prepare: async () => {
            const user = await money.createMember('iq');
            const now = new Date();
            const inquiry = await db().Inquiry.create({
                user_id: user.uuid, category: 'BUG', title: '방이 안 열려요', body: '멈춤', status: 'OPEN', created_at: now, updated_at: now,
            });
            return { values: { id: inquiry.id }, body: { requestId: crypto.randomUUID(), body: '고쳤어요' } };
        },
    },
};

const writeRoutes = listAdminRoutes().filter((route) => route.isWrite);

test('AD-300: 쓰기 경로 전부 시험 표에 있음 (새 쓰기 경로가 생기면 여기서 걸림)', () => {
    const keys = writeRoutes.map((route) => route.key).sort();
    const missing = keys.filter((key) => !RECIPES[key]);
    const stale = Object.keys(RECIPES).filter((key) => !keys.includes(key));
    assert.deepEqual(missing, [], '기록 확인 방법이 없는 새 쓰기 경로 — RECIPES에 더하기');
    assert.deepEqual(stale, [], '라우터에 없는 경로가 표에 남음');
    const { AUDIT_ACTIONS } = require('../../admin/services/core/auditActions');
    for (const [key, recipe] of Object.entries(RECIPES)) assert.equal(AUDIT_ACTIONS[recipe.action], recipe.action, key);
});

// 경로 하나 성공시키고 기준선 뒤 새 기록 → 맞으면 null, 틀리면 걸린 까닭 한 줄
const checkRoute = async (ctx, route) => {
    const recipe = RECIPES[route.key];
    if (!recipe) return `${route.key} → 시험 표에 없음`;
    const prepared = await recipe.prepare(ctx);
    const agent = prepared.agent ?? ctx.agent;
    const adminId = prepared.adminId ?? ctx.admin.id;
    const baseline = (await db().AdminAuditLog.max('id')) ?? 0;
    const res = await agent.request(route.method, fillPath(route, prepared.values ?? {}), { body: prepared.body ?? {} });
    if (res.status < 200 || res.status >= 300) return `${route.key} → ${res.status} ${JSON.stringify(res.body)}`;
    const rows = await db().AdminAuditLog.findAll({ where: { id: { [db().Sequelize.Op.gt]: baseline } }, raw: true });
    const mine = rows.filter((row) => row.action === recipe.action);
    if (mine.length !== 1) return `${route.key} → ${recipe.action} 기록 ${mine.length}줄`;
    const strangers = rows.filter((row) => row.admin_id !== adminId);
    if (strangers.length > 0) return `${route.key} → 다른 관리자 기록 ${strangers.map((row) => row.action).join(',')}`;
    return null;
};

test('AD-300: 쓰기 경로 전부 한 번씩 성공 → 그 동작 기록 한 줄씩, 부른 관리자 이름으로', async (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
        return;
    }
    const app = await adminTestApp({ t });
    const ctx = { url: app.url, agent: app.agent, admin: app.admin };
    const failures = [];
    for (const route of writeRoutes) {
        const failure = await checkRoute(ctx, route);
        if (failure) failures.push(failure);
    }
    t.diagnostic(`쓰기 경로 ${writeRoutes.length}개 확인`);
    assert.deepEqual(failures, []);
});
