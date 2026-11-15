'use strict';

// 지갑 = 장부 합 DB 시험: 돈 움직임 종류마다·여러 일 섞어도·동시에 사도 지갑 골드·다이아가 장부 합과 같은지, 0 밑·10억 위로 안 가는지 시험 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-294~307 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test.before(h.prepareDb);
test.after(h.closeDb);

// 쿠폰 요청은 ip마다 10분 30번 제한이 있어 시험마다 다른 주소로 보냄
let ipSerial = 0;
const nextIp = () => `10.12.${Math.floor(ipSerial / 250)}.${(ipSerial++ % 250) + 1}`;
const redeem = (base, uuid, code) => h.call(base, uuid, 'POST', '/economy/coupons/redeem', { code }, { ip: nextIp() });

// 관리자 보상 (관리자 계정이 남에게 줌, 보상 사유는 서버 표 값만)
const adminGrant = (base, adminUuid, userId, reason = 'EVENT_COMPENSATION_GOLD', referenceEventId = `a12d-grant-${crypto.randomUUID()}`) =>
    h.call(base, adminUuid, 'POST', '/economy/admin/grant', { userId, reason, referenceEventId });

// ── A12-B-294~301 돈 움직임 종류마다 지갑 = 장부 합 ──
const KINDS = [
    {
        no: 'A12-B-294', label: '아이템 구매',
        run: async ({ base, user }) => {
            await h.fund(user, 'GOLD', 1000);
            assert.equal((await h.buy(base, user, 'profile-border-남작')).status, 201);
        },
    },
    {
        no: 'A12-B-295', label: '묶음 구매',
        run: async ({ base, user }) => {
            await h.fund(user, 'GOLD', 1000);
            assert.equal((await h.buyBulk(base, user, ['profile-border-남작', 'profile-border-자작'])).status, 201);
        },
    },
    {
        no: 'A12-B-296', label: '골드 구매',
        run: async ({ base, user }) => {
            const product = await h.createProduct();
            await h.fund(user, 'DIAMOND', 50);
            const res = await h.call(base, user, 'POST', '/economy/gold-purchases', { productId: product.product_id, version: 1, referenceEventId: 'a12d-gp' });
            assert.equal(res.status, 200, JSON.stringify(res.body));
        },
    },
    {
        no: 'A12-B-297', label: '충전 지급',
        run: async ({ t, base, user }) => {
            const fake = h.installFakeToss(t);
            const product = await h.createTopupProduct();
            const { confirm } = await h.runTopup(base, user, fake, product);
            assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
            assert.equal(confirm.body.status, 'GRANTED');
        },
    },
    {
        no: 'A12-B-298', label: '쿠폰',
        run: async ({ base, user }) => {
            const coupon = await h.createCoupon({ reward_type: 'DIAMOND', reward_amount: 7 });
            assert.equal((await redeem(base, user, coupon.code)).status, 201);
        },
    },
    {
        no: 'A12-B-299', label: '관리자 보상 지급',
        run: async ({ base, user }) => {
            const admin = await h.createUser('adm', { role: 'ADMIN' });
            const res = await adminGrant(base, admin, user);
            assert.equal(res.status, 201, JSON.stringify(res.body));
        },
    },
    {
        no: 'A12-B-300', label: '판 보상(GAME_REWARD 장부 줄 넣기)',
        run: async ({ user }) => {
            await h.addLedger(user, { reason: 'GAME_REWARD', amount: 1, referenceEventId: `game-reward:${crypto.randomUUID()}` });
        },
    },
    {
        no: 'A12-B-301', label: '거절된 구매 뒤',
        run: async ({ base, user }) => {
            await h.fund(user, 'GOLD', 100);
            assert.equal((await h.buy(base, user, 'profile-border-남작')).status, 400);
        },
    },
];

for (const c of KINDS) {
    test(`${c.no} ${c.label} 뒤 → 골드·다이아 둘 다 지갑 = 장부 합`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('kind');
        // 다이아도 장부로 조금 넣어 둠 (두 통화 다 0이 아닌 상태에서 확인)
        await h.fund(user, 'DIAMOND', 3);
        await c.run({ t, base, user });
        const { entries } = await h.assertWalletMatchesLedger(user);
        assert.ok(entries.length >= 2);
    });
}

// 여러 일을 정해진 차례로 섞어 함 (성공·거절 섞임), 무작위 없음
const mixedOps = async (t, base, user, count) => {
    const fake = h.installFakeToss(t);
    const admin = await h.createUser('adm', { role: 'ADMIN' });
    const goldProduct = await h.createProduct();
    const topupProduct = await h.createTopupProduct();
    const sharedCoupon = await h.createCoupon({ reward_amount: 50 });
    const items = ['profile-border-남작', 'profile-border-자작', 'profile-border-백작', 'player-skin-광대1-불멸', 'player-card-가면'];
    const outcomes = [];
    for (let i = 0; i < count; i += 1) {
        const step = i % 6;
        let res;
        if (step === 0) res = await h.buy(base, user, items[Math.floor(i / 6) % items.length]); // 돈 모자람·이미 가짐 섞임
        else if (step === 1) res = await h.call(base, user, 'POST', '/economy/gold-purchases', { productId: goldProduct.product_id, version: 1, referenceEventId: `a12d-mix-${i}` });
        else if (step === 2) res = (await h.runTopup(base, user, fake, topupProduct, { scenario: i % 4 === 0 ? 'reject' : 'approve' })).confirm;
        else if (step === 3) res = await redeem(base, user, sharedCoupon.code); // 두 번째부터 이미 씀
        else if (step === 4) res = await adminGrant(base, admin, user, 'EVENT_COMPENSATION_GOLD', `a12d-mix-grant-${i % 12}`);
        else res = await h.addLedger(user, { reason: 'GAME_REWARD', amount: 1, referenceEventId: `game-reward:a12d-${i}` }).then(() => ({ status: 201 }));
        outcomes.push(res.status);
    }
    return outcomes;
};

test('A12-B-302 위 일 30번 섞어 함(성공·거절 섞임) → 지갑 = 장부 합', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('mix');
    const outcomes = await mixedOps(t, base, user, 30);
    // 성공과 거절이 둘 다 있었는지 (섞였는지)
    assert.ok(outcomes.some((s) => s < 300), `성공 없음 ${outcomes}`);
    assert.ok(outcomes.some((s) => s >= 400), `거절 없음 ${outcomes}`);
    await h.assertWalletMatchesLedger(user);
});

test('A12-B-303 장부 줄마다 balance_after = 앞 줄 balance_after + amount (통화마다) [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('chain');
    await mixedOps(t, base, user, 18);

    const entries = await h.ledgerOf(user);
    assert.ok(entries.length >= 10);
    for (const currency of ['GOLD', 'DIAMOND']) {
        let previous = 0;
        for (const entry of entries.filter((row) => row.currency === currency)) {
            assert.equal(Number(entry.balance_after), previous + Number(entry.amount), `${currency} 장부 ${entry.id} 이어짐 끊김`);
            previous = Number(entry.balance_after);
        }
    }
});

test('A12-B-304 골드 0에서 −1 → INSUFFICIENT_BALANCE·지갑 0 그대로', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser('zero');
    await h.ensureWallet(user);
    const before = await h.fourTables(user);

    await assert.rejects(h.addLedger(user, { reason: 'QA_TEST_GRANT', amount: -1 }), { code: 'INSUFFICIENT_BALANCE' });
    assert.equal((await h.walletOf(user)).gold, 0);
    assert.deepEqual(await h.fourTables(user), before);
});

test('A12-B-305 골드 1,000,000,000에서 +1 → BALANCE_LIMIT_EXCEEDED·그대로 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const user = await h.createUser('max');
    await h.fund(user, 'GOLD', 1_000_000_000);
    const before = await h.fourTables(user);

    await assert.rejects(h.addLedger(user, { reason: 'QA_TEST_GRANT', amount: 1 }), { code: 'BALANCE_LIMIT_EXCEEDED' });
    assert.equal((await h.walletOf(user)).gold, 1_000_000_000);
    assert.deepEqual(await h.fourTables(user), before);
});

test('A12-B-306 두 사람이 각 10번 동시에 삼 → 사람마다 지갑 = 자기 장부 합', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const alice = await h.createUser('ca');
    const bob = await h.createUser('cb');
    await h.fund(alice, 'GOLD', 10_000);
    await h.fund(bob, 'GOLD', 10_000);
    // 서로 다른 아이템 10개 (테두리 6 + 스킨 4)
    const items = ['남작', '자작', '백작', '후작', '공작', '황제'].map((tier) => `profile-border-${tier}`)
        .concat(['player-skin-광대1-불멸', 'player-skin-광대2-카오스', 'player-skin-귀족1-블러드', 'player-skin-귀족2-로코코']);

    const answers = await Promise.all([alice, bob].flatMap((user) => items.map((itemId) => h.buy(base, user, itemId))));
    for (const res of answers) assert.equal(res.status, 201, JSON.stringify(res.body));
    for (const user of [alice, bob]) {
        const { entries } = await h.assertWalletMatchesLedger(user);
        assert.equal(entries.filter((row) => row.reason === 'PURCHASE').length, 10);
        // 값 합: 테두리 200+300+400+500+700+1000 = 3100, 스킨 4 × 500 = 2000
        assert.equal((await h.walletOf(user)).gold, 10_000 - 3100 - 2000);
    }
});

test('A12-B-307 잔액 500 + 500골드 스킨 둘을 번호 다르게 동시에 → 하나만 됨·하나 INSUFFICIENT_BALANCE·잔액 0·장부 1줄', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('dbl');
    await h.fund(user, 'GOLD', 500);

    const answers = await Promise.all([
        h.buy(base, user, 'player-skin-광대1-불멸', 'a12d-dbl-1'),
        h.buy(base, user, 'player-skin-광대2-카오스', 'a12d-dbl-2'),
    ]);
    const statuses = answers.map((res) => res.status).sort();
    assert.deepEqual(statuses, [201, 400]);
    assert.equal(answers.find((res) => res.status === 400).body.code, 'INSUFFICIENT_BALANCE');
    assert.equal((await h.walletOf(user)).gold, 0);
    assert.equal((await h.ledgerOf(user)).filter((row) => row.reason === 'PURCHASE').length, 1);
});
