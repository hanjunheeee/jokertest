'use strict';

// 진짜 DB 시험: 관리자 신고 처리 시각·결제 주문 기간 찾기가 서버 시간대(한국)와 상관없이 맞는지
// 근거: docs/버그수정_결정_2026-11-09.md 2026-11-10 시간대 버그 (raw 질의에 Date 넘기면 이 PC 시간대 글자로 바뀌어 9시간 어긋남)
// 이 PC가 UTC여도 버그가 보이게 시간대를 한국으로 고정함 (Date 쓰기 전에)
process.env.TZ = 'Asia/Seoul';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-timezone-integration-secret';
// 관리자 계정 만들 때 OTP 열쇠가 있어야 함 (adminTestApp 시험 값과 같음)
process.env.ADMIN_TOTP_KEY = process.env.ADMIN_TOTP_KEY || 'e'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, createTestAdmin } = require('./helpers/adminTestApp');
const money = require('./helpers/money');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const MINUTE = 60_000;

test('시간대: 신고 기각 처리 시각(handled_at)이 지금과 1분 안 (9시간 밀리지 않음)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { dismissReport } = require('../../admin/services/reports/handle');
    const admin = await createTestAdmin();
    const reporter = await money.createMember('tzr');
    const target = await money.createMember('tzt');
    const report = await db().Report.create({
        reporter_id: reporter.uuid, target_id: target.uuid, game_id: crypto.randomUUID(), reason_code: 'ABUSE', memo: '시간대',
    });

    const before = Date.now();
    await dismissReport({ req: { admin: { id: admin.id }, adminRequestMeta: { ip: '127.0.0.1' } }, id: report.id });

    const saved = await db().Report.findByPk(report.id, { raw: true });
    const gap = new Date(saved.handled_at).getTime() - before;
    assert.ok(Math.abs(gap) < MINUTE, `처리 시각이 ${Math.round(gap / 3_600_000)}시간 어긋남: ${new Date(saved.handled_at).toISOString()}`);
});

test('시간대: 결제 주문 기간 찾기(from·to)가 방금 만든 주문을 찾음', async (t) => {
    if (skipWithoutDb(t)) return;
    const { listOrders } = require('../../admin/services/payments/list');
    const member = await money.createMember('tzp');
    const order = await money.createGrantedOrder(member.uuid);

    const now = Date.now();
    const found = await listOrders({ userUuid: member.uuid, from: new Date(now - 10 * MINUTE), to: new Date(now + 10 * MINUTE) });
    assert.deepEqual(found.items.map((item) => item.orderId), [order.order_id], '앞뒤 10분 안 주문인데 못 찾음');

    // 1시간 뒤부터 = 없음 (거꾸로 넓게 잡혀도 안 됨)
    const later = await listOrders({ userUuid: member.uuid, from: new Date(now + 60 * MINUTE) });
    assert.deepEqual(later.items, []);
});
