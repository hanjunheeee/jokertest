'use strict';

// 기본 지급·지갑 읽기 DB 시험: 가입하면 기본 아이템 25개·지갑 0·기본 장착, 기본 지급 한 번만, 지갑 첫 읽기 동시에, 지갑 읽기 모양, 관리자 보상 같은 번호 두 번을 시험 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-396~400 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { prepareSignupProof } = require('../helpers/signupProof');
const { passSignupTerms } = require('../helpers/termsStub');
const signupService = require('../../services/auth/account/signup');

test.before(h.prepareDb);
test.after(h.closeDb);

test('A12-B-396 가입 → 기본 아이템 25개(사진 16·평민 테두리 1·기본 이모티콘 8)·지갑 0·0·장착 기본 사진·테두리', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    passSignupTerms(t);
    // 진짜 이메일 가입 길 (인증 증명은 메모리 메일로, 약관 검사만 통과로)
    const email = `a12d-join-${crypto.randomUUID()}@example.test`;
    const { signupProof } = await prepareSignupProof(email);
    const user = await signupService.signup({
        email, password: 'a12d-pass-1234', passwordConfirm: 'a12d-pass-1234',
        nickname: `가${h.hex(2)}`, birthDate: '2000-01-01', signupProof,
    });

    const res = await h.call(base, user.uuid, 'GET', `/economy/accounts/${user.uuid}/entitlements`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const byType = (type) => res.body.entitlements.filter((row) => row.itemType === type).length;
    assert.equal(res.body.entitlements.length, 25);
    assert.equal(byType('PROFILE_PHOTO'), 16);
    assert.deepEqual(res.body.entitlements.filter((row) => row.itemType === 'PROFILE_BORDER').map((row) => row.itemId), ['profile-border-평민']);
    assert.equal(byType('EMOTICON'), 8);
    assert.equal(res.body.loadout.selectedProfilePhotoId, 'player-profile-금빛가면');
    assert.equal(res.body.loadout.selectedProfileBorderId, 'profile-border-평민');

    const wallet = await h.call(base, user.uuid, 'GET', `/economy/accounts/${user.uuid}/wallet`);
    assert.equal(wallet.body.balanceGold, 0);
    assert.equal(wallet.body.balanceDiamond, 0);
});

test('A12-B-397 지갑 읽기 2번 → 가진 것 줄 늘지 않음 (기본 지급 한 번만)', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('twice');

    assert.equal((await h.call(base, user, 'GET', `/economy/accounts/${user}/wallet`)).status, 200);
    const afterFirst = (await h.entitlementsOf(user)).length;
    assert.equal((await h.call(base, user, 'GET', `/economy/accounts/${user}/wallet`)).status, 200);
    assert.equal(afterFirst, 25);
    assert.equal((await h.entitlementsOf(user)).length, afterFirst);
});

test('A12-B-398 지갑 첫 읽기 동시에 둘 → 지갑 1줄 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('race');

    const answers = await Promise.all([1, 2].map(() => h.call(base, user, 'GET', `/economy/accounts/${user}/wallet`)));
    for (const res of answers) assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await h.models().EconomyWallet.count({ where: { user_id: user } }), 1);
});

test('A12-B-399 GET /accounts/:userId/wallet 모양 → 골드·다이아·가진 것 목록', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('shape');
    await h.fund(user, 'GOLD', 30);
    await h.fund(user, 'DIAMOND', 4);

    const res = await h.call(base, user, 'GET', `/economy/accounts/${user}/wallet`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.balanceGold, 30);
    assert.equal(res.body.balanceDiamond, 4);
    assert.ok(Array.isArray(res.body.entitlements), `가진 것 목록 없음: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.entitlements.length, 25);
});

test('A12-B-400 관리자 보상 같은 몸 두 번 → 201 뒤 200·장부 1줄', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('grant');
    const admin = await h.createUser('adm', { role: 'ADMIN' });
    const body = { userId: user, reason: 'EVENT_COMPENSATION_GOLD', referenceEventId: `a12d-grant-${h.hex()}` };

    const first = await h.call(base, admin, 'POST', '/economy/admin/grant', body);
    const again = await h.call(base, admin, 'POST', '/economy/admin/grant', body);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.idempotent, true);
    assert.equal(await h.countLedger(user, { reason: 'EVENT_COMPENSATION_GOLD' }), 1);
    assert.equal((await h.walletOf(user)).gold, 1000);
});
