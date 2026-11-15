'use strict';

// A12 충전 시험 판: 서버 + 충전 가짜 DB + 가짜 결제사 + 로그인한 사람 하나, 주문 만들기·확인·조회 요청 줄임
// a12-topup-confirm·lookup·open-orders·errors.test.js가 씀 (결제 키는 지어낸 글자, 진짜 토스 안 감)
const w = require('./a12-request-world');

// 결제사 시나리오 10가지 (fakeTossAdapter SCENARIOS와 같은 이름)
const SCENARIOS = ['approve', 'lost-response', 'unreached', 'reject', 'cancel', 'expire', 'waiting', 'tamper-amount', 'tamper-order', 'tamper-key'];

// 충전 상품: 1100원 → 다이아 100 + 덤 10 (지급 합 110)
const PRODUCT = w.topupProductRow({ product_id: 'dia-100', pay_amount: 1100, grant_amount: 100, bonus_amount: 10, version: 3 });
const GRANT_TOTAL = 110;

let keySeq = 0;
// 시험마다 다른 결제 키 (모양만 맞는 지어낸 값)
const newPaymentKey = () => {
    keySeq += 1;
    return `pk_a12_${process.pid}_${String(keySeq).padStart(4, '0')}`;
};

const setupTopup = async (t, { products = [PRODUCT] } = {}) => {
    const base = await w.startApp(t);
    const db = w.topupDb(t, { products });
    const toss = w.fakeToss(t);
    const me = w.uid('a12-topup');
    const cookie = w.login(me);

    // 주문 만들기 (화면이 보내는 몸 그대로) → 주문 id·금액
    const createOrder = async (productId = PRODUCT.product_id, version = PRODUCT.version) => {
        const res = await w.call(base, 'POST', '/economy/topup/orders', { cookie, body: { productId, version } });
        if (res.body?.ok !== true) throw new Error(`준비: 주문 만들기 실패 ${res.status} ${JSON.stringify(res.body)}`);
        return { orderId: res.body.orderId, amount: res.body.amount };
    };
    // 결제창에서 결제한 것처럼 결제사에 결제 하나 등록
    const pay = (orderId, amount, scenario = 'approve', paymentKey = newPaymentKey()) => {
        toss.registerPayment(paymentKey, { orderId, amount, scenario });
        return paymentKey;
    };
    const confirm = (orderId, body, asCookie = cookie) => w.call(base, 'POST', `/economy/topup/orders/${orderId}/confirm`, { cookie: asCookie, body });
    const lookup = (orderId, asCookie = cookie) => w.call(base, 'GET', `/economy/topup/orders/${orderId}`, { cookie: asCookie });
    const openOrders = (query = '?state=open', asCookie = cookie) => w.call(base, 'GET', `/economy/topup/orders${query}`, { cookie: asCookie });

    // 주문 만들고 결제 등록까지 (시나리오대로)
    const paidOrder = async (scenario = 'approve') => {
        const { orderId, amount } = await createOrder();
        const paymentKey = pay(orderId, amount, scenario);
        return { orderId, amount, paymentKey };
    };

    return {
        base, db, toss, me, cookie, createOrder, pay, confirm, lookup, openOrders, paidOrder,
        ledgerCount: () => db.ledger().filter((row) => row.reason === 'DIAMOND_TOPUP').length,
        diamond: () => db.diamond(me),
        providerCalls: () => toss.calls.length,
    };
};

module.exports = { ...w, SCENARIOS, PRODUCT, GRANT_TOTAL, newPaymentKey, setupTopup };
