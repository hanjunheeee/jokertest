'use strict';

// 상점·마이페이지 시험 도구 파일, 시험 DB에 골드·다이아 넣기·쿠폰·충전 주문 만들기 + 상점 화면 열기
// tests/store·tests/mypage 시험이 씀 (시험 DB joker_e2e만, 계정은 시험마다 새로)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { backend, query } = require('../../helpers/db');
const { skipIntro } = require('../../helpers/ui');

// DB 시각 글자 (UTC) — 날 SQL에 Date를 그대로 넣으면 이 PC 시간대(KST)로 들어가 9시간 어긋남
const sqlTime = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);

const rand = (n = 4) => crypto.randomBytes(n).toString('hex').toUpperCase();

/** 지갑에 재화 넣기 (장부 거래로, 화면은 다시 불러야 보임) */
async function grant(uuid, currency, amount) {
    const { db, economyService } = backend();
    await economyService.grantReward({ userId: uuid, amount, currency, reason: 'REWARD', referenceEventId: `e2e:${rand(8)}` }, db);
}

/** 지갑 잔액 { gold, diamond } (지갑 줄 없으면 0) */
async function wallet(uuid) {
    const rows = await query('SELECT balance_gold, balance_diamond FROM economy_wallets WHERE user_id = ?', [uuid]);
    return { gold: rows[0]?.balance_gold ?? 0, diamond: rows[0]?.balance_diamond ?? 0 };
}

/** 보유 아이템 id 목록 */
async function owned(uuid) {
    const rows = await query('SELECT item_id FROM economy_entitlements WHERE user_id = ?', [uuid]);
    return rows.map((r) => r.item_id);
}

/** 장부 줄 (최근 것 먼저) */
async function ledger(uuid) {
    return query('SELECT reason, currency, amount, item_id, balance_after FROM economy_ledger_entries WHERE user_id = ? ORDER BY id DESC', [uuid]);
}

/** 장착 표 한 줄 */
async function loadout(uuid) {
    const rows = await query('SELECT * FROM economy_loadouts WHERE user_id = ?', [uuid]);
    return rows[0] ?? null;
}

/**
 * 시험 쿠폰 만들기 → 코드 (겹치지 않게 무작위)
 * @param {{rewardType?:'GOLD'|'DIAMOND', amount?:number, maxUses?:number|null, usedCount?:number, startsAt?:Date|null, endsAt?:Date|null, active?:boolean}} [o]
 */
async function createCoupon(o = {}) {
    const code = `E2E-${rand(5)}`;
    const now = sqlTime(new Date());
    await query(
        'INSERT INTO coupons (code, reward_type, reward_amount, max_uses, used_count, starts_at, ends_at, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [code, o.rewardType ?? 'GOLD', o.amount ?? 300, o.maxUses ?? null, o.usedCount ?? 0, sqlTime(o.startsAt), sqlTime(o.endsAt), o.active === false ? 0 : 1, now, now],
    );
    return code;
}

/** 쿠폰 쓴 횟수 */
async function couponUsedCount(code) {
    const rows = await query('SELECT used_count FROM coupons WHERE code = ?', [code]);
    return rows[0]?.used_count ?? null;
}

/**
 * 충전 주문 줄 직접 넣기 (결제창 안 거치고 결제 복귀 처리만 볼 때) → { orderId, paymentKey, amount }
 * @param {string} uuid 주문 주인
 * @param {{status?:string, paymentKey?:string|null, productId?:string}} [o]
 */
async function createTopupOrder(uuid, o = {}) {
    const productId = o.productId ?? 'test-diamond-10';
    const [product] = await query('SELECT * FROM economy_currency_products WHERE product_id = ?', [productId]);
    if (!product) throw new Error(`시험 상품 없음: ${productId}`);
    const orderId = `e2e-order-${rand(8).toLowerCase()}`;
    const paymentKey = o.paymentKey === undefined ? `tgen_e2e_${rand(8)}` : o.paymentKey;
    const now = sqlTime(new Date());
    await query(
        'INSERT INTO economy_topup_orders (order_id, user_id, product_id, version, pay_amount, grant_amount, bonus_amount, order_name, status, payment_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [orderId, uuid, productId, product.version, product.pay_amount, product.grant_amount, product.bonus_amount, product.display_name, o.status ?? 'CREATED', paymentKey, now, now],
    );
    return { orderId, paymentKey, amount: product.pay_amount };
}

/** 상점 열기 (입장 영상 건너뛰기) → 쿠폰 버튼이 보일 때까지 */
async function gotoStore(page, path = '/store') {
    await page.goto(path);
    await skipIntro(page);
    await expect(page.getByRole('button', { name: '쿠폰 입력' })).toBeVisible();
}

/** 분류 고르기 (이미 눌린 분류를 또 누르면 풀리므로 안 눌렸을 때만) */
async function pickCategory(page, name) {
    const btn = page.getByRole('complementary').getByRole('button', { name, exact: true });
    if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

/** 상품 칸 고르기 (예: '귀족 블러드 500') */
async function pickItem(page, name) {
    const slot = page.getByRole('button', { name, exact: true });
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
}

/** 고른 상품 설명 칸 */
const detail = (page) => page.getByRole('region', { name: '선택한 아이템 정보' });

/** 보유 재화 표시 (aria-label '골드 500' 모양) */
// 화면 이름: 골드 = '무료 재화', 다이아 = '유료 재화'
const BALANCE_LABELS = { 골드: '무료 재화', 다이아: '유료 재화' };
const balance = (page, label, amount) => page.locator(`[aria-label="보유 재화"] [aria-label="${BALANCE_LABELS[label] ?? label} ${amount}"]`);

module.exports = {
    rand, grant, wallet, owned, ledger, loadout, createCoupon, couponUsedCount, createTopupOrder, gotoStore, pickCategory, pickItem, detail, balance,
};
