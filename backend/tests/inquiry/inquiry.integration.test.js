'use strict';

// 플레이어 문의 진짜 DB 시험 (AD-260~263·265), /inquiries 경로를 플레이어 로그인으로 불러 봄
// npm run test:with-db -- tests/inquiry (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'inquiry-integration-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Sequelize } = require('sequelize');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { MIGRATIONS } = require('../../scripts/migrate-db');
const { generateToken } = require('../../utils/auth/credentials');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const bannedWords = require('../../services/ops/bannedWords');

const { managedTables, dropOrder } = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });
const db = require('../../models');

let sequelize;
let baseUrl;
let server;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    await sequelize.authenticate();
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables, dropOrder });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/inquiries', require('../../routes/inquiry.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    server = http.createServer(app);
    ({ url: baseUrl } = await listenOnFetchablePort(server));
});

test.after(async () => {
    bannedWords.__setWordsForTests([]);
    if (server) await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
    if (sequelize) await sequelize.close();
    if (TEST_DB_URL) await db.sequelize.close();
});

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

// 로그인된 플레이어 한 명 (사용자 줄 + 살아 있는 세션) → uuid
const createPlayer = async () => {
    const uuid = crypto.randomUUID();
    await db.User.create({ uuid, password_hash: 'x', nickname: `q${uuid.slice(0, 7)}`, email: `q-${uuid}@example.com` });
    await db.UserSession.create({ id: `session-${uuid}`, user_id: uuid, is_online: true });
    return uuid;
};

// 그 플레이어로 요청 → { status, body }
const call = async (uuid, method, path, body) => {
    const token = generateToken({ uuid, role: 'USER', sessionId: `session-${uuid}` });
    const headers = { cookie: `accessToken=${token}`, connection: 'close' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
};

const post = (uuid, body) => call(uuid, 'POST', '/inquiries', body);
const sample = (n = 1) => ({ category: 'BUG', title: `문의 ${n}`, body: `내용 ${n}` });

// 지난 문의 바로 넣기 (제한 시험용, 지금보다 hoursAgo 시간 전)
const seedInquiries = async (userId, count, { status = 'OPEN', hoursAgo = 2 } = {}) => {
    const at = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    for (let i = 0; i < count; i += 1) {
        await db.Inquiry.create({ user_id: userId, category: 'ETC', title: `옛 문의 ${i}`, body: '옛 내용', status, created_at: at, updated_at: at });
    }
};

test('AD-260: 쓰기 → 201 OPEN, 내 목록에 답 기다림', async (t) => {
    if (skipWithoutDb(t)) return;
    const me = await createPlayer();
    const made = await post(me, { category: 'ACCOUNT', title: ' 닉네임 바꾸고 싶어요 ', body: '바꾸는 곳을 못 찾음' });
    assert.equal(made.status, 201);
    assert.equal(made.body.ok, true);
    const { inquiry } = made.body;
    assert.equal(typeof inquiry.id, 'number');
    assert.equal(inquiry.category, 'ACCOUNT');
    assert.equal(inquiry.title, '닉네임 바꾸고 싶어요');
    assert.equal(inquiry.body, '바꾸는 곳을 못 찾음');
    assert.equal(inquiry.status, 'OPEN');
    assert.deepEqual(inquiry.replies, []);
    assert.ok(!Number.isNaN(Date.parse(inquiry.createdAt)));

    const list = await call(me, 'GET', '/inquiries');
    assert.equal(list.status, 200);
    assert.equal(list.body.ok, true);
    assert.deepEqual(list.body.inquiries.map((row) => [row.id, row.title, row.status, row.answeredAt]), [[inquiry.id, '닉네임 바꾸고 싶어요', 'OPEN', null]]);
    assert.equal(list.body.inquiries[0].body, undefined);
});

test('AD-261: 1분 2번 넘으면 429', async (t) => {
    if (skipWithoutDb(t)) return;
    const me = await createPlayer();
    assert.equal((await post(me, sample(1))).status, 201);
    assert.equal((await post(me, sample(2))).status, 201);
    const third = await post(me, sample(3));
    assert.equal(third.status, 429);
    assert.equal(third.body.ok, false);
    assert.equal(third.body.code, 'INQUIRY_RATE_LIMITED');
    assert.equal(typeof third.body.message, 'string');
    assert.equal(await db.Inquiry.count({ where: { user_id: me } }), 2);
});

test('AD-261: 하루 10번 넘으면 429 (답 받은 것도 셈)', async (t) => {
    if (skipWithoutDb(t)) return;
    const me = await createPlayer();
    await seedInquiries(me, 9, { status: 'ANSWERED' });
    assert.equal((await post(me, sample(10))).status, 201);
    const over = await post(me, sample(11));
    assert.equal(over.status, 429);
    assert.equal(over.body.code, 'INQUIRY_RATE_LIMITED');
    // 하루 지난 것은 안 셈
    const other = await createPlayer();
    await seedInquiries(other, 10, { status: 'ANSWERED', hoursAgo: 25 });
    assert.equal((await post(other, sample(1))).status, 201);
});

test('AD-261: 답 기다림 5개면 409 INQUIRY_OPEN_LIMIT', async (t) => {
    if (skipWithoutDb(t)) return;
    const me = await createPlayer();
    await seedInquiries(me, 5, { status: 'OPEN' });
    const blocked = await post(me, sample(6));
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'INQUIRY_OPEN_LIMIT');
    assert.equal(blocked.body.ok, false);
});

test('AD-262: 금지어는 가려서 저장', async (t) => {
    if (skipWithoutDb(t)) return;
    bannedWords.__setWordsForTests(['바보']);
    t.after(() => bannedWords.__setWordsForTests([]));
    const me = await createPlayer();
    const made = await post(me, { category: 'ETC', title: '바보 같은 버그', body: '진짜 바보바보' });
    assert.equal(made.status, 201);
    assert.equal(made.body.inquiry.title, '** 같은 버그');
    assert.equal(made.body.inquiry.body, '진짜 ****');
    const row = await db.Inquiry.findByPk(made.body.inquiry.id, { raw: true });
    assert.equal(row.title, '** 같은 버그');
    assert.equal(row.body, '진짜 ****');
});

test('AD-263: 남의 문의·없는 번호는 404 INQUIRY_NOT_FOUND, 남의 것은 내 목록에 없음', async (t) => {
    if (skipWithoutDb(t)) return;
    const owner = await createPlayer();
    const stranger = await createPlayer();
    const made = await post(owner, sample(1));
    const id = made.body.inquiry.id;

    const peek = await call(stranger, 'GET', `/inquiries/${id}`);
    assert.equal(peek.status, 404);
    assert.deepEqual(peek.body, { ok: false, code: 'INQUIRY_NOT_FOUND', message: peek.body.message });
    for (const bad of ['abc', '0', '-1', '1.5', '99999999']) {
        const res = await call(owner, 'GET', `/inquiries/${bad}`);
        assert.equal(res.status, 404, bad);
        assert.equal(res.body.code, 'INQUIRY_NOT_FOUND', bad);
    }
    assert.deepEqual((await call(stranger, 'GET', '/inquiries')).body.inquiries, []);
    assert.equal((await call(owner, 'GET', `/inquiries/${id}`)).status, 200);
});

test('AD-265: 답 뒤 내 문의 상세에 답 보임 — "운영팀", ANSWERED', async (t) => {
    if (skipWithoutDb(t)) return;
    const me = await createPlayer();
    const made = await post(me, sample(1));
    const id = made.body.inquiry.id;
    // 2-16 관리자 답 대신 표에 바로 넣음
    const adminId = crypto.randomUUID();
    await db.AdminUser.create({ id: adminId, login_id: `adm${adminId.slice(0, 8)}`, password_hash: 'x' });
    const answeredAt = new Date();
    const reply = await db.InquiryReply.create({ inquiry_id: id, admin_id: adminId, body: '고쳤어요', created_at: answeredAt });
    await db.Inquiry.update({ status: 'ANSWERED', answered_at: answeredAt }, { where: { id } });

    const detail = await call(me, 'GET', `/inquiries/${id}`);
    assert.equal(detail.status, 200);
    const { inquiry } = detail.body;
    assert.equal(inquiry.status, 'ANSWERED');
    assert.equal(inquiry.body, '내용 1');
    assert.equal(inquiry.replies.length, 1);
    assert.deepEqual(Object.keys(inquiry.replies[0]).sort(), ['body', 'createdAt', 'from', 'id']);
    assert.equal(inquiry.replies[0].id, Number(reply.id));
    assert.equal(inquiry.replies[0].from, '운영팀');
    assert.equal(inquiry.replies[0].body, '고쳤어요');
    assert.ok(!JSON.stringify(detail.body).includes(adminId));

    const list = await call(me, 'GET', '/inquiries');
    assert.equal(list.body.inquiries[0].status, 'ANSWERED');
    assert.ok(!Number.isNaN(Date.parse(list.body.inquiries[0].answeredAt)));
});
