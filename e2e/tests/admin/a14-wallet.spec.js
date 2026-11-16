'use strict';

// 관리자 골드·다이아 주고 뺏기 브라우저 시험 (PC 크기) — 골드 +100 → 관리자 지갑·플레이어 상점 잔액, 모자란 뺏기 글, 딱 잔액만큼 뺏기 → 0, 장부 두 줄
// 목록 시험목록/A14-관리자.md 번호 A14-E-064~067 — 돈이 걸려 지갑 숫자를 화면·DB 둘 다 봄 / 모임만: npx playwright test --list tests/admin/a14-wallet.spec.js
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const store = require('../store/store-tools');
const k = require('./_a14-kit');

const { E, U } = k;
const walletBox = (page) => page.getByRole('region', { name: '골드·다이아' });

// 회원 골드를 딱 amount로 맞춤 (관리자 API 장부로 — 준비용)
async function setGold(adminPage, uuid, amount) {
    const now = (await store.wallet(uuid)).gold;
    if (now === amount) return;
    await k.adminApi(adminPage, 'POST', `/members/${uuid}/wallet/adjust`, {
        requestId: crypto.randomUUID(), currency: 'GOLD', amount: amount - now, reason: '시험 준비',
    });
    expect((await store.wallet(uuid)).gold).toBe(amount);
}

// 지갑 칸에서 금액·사유 넣고 주기/뺏기 → 확인 창
async function adjustUi(adminPage, { direction, amount, reason, currency = 'GOLD' }) {
    const box = walletBox(adminPage);
    await box.getByLabel('재화', { exact: true }).selectOption(currency);
    await box.getByLabel('금액', { exact: true }).fill(String(amount));
    await box.getByLabel('사유', { exact: true }).fill(reason);
    await box.getByRole('button', { name: direction === 'grant' ? '주기' : '뺏기', exact: true }).click();
    const confirm = k.dialog(adminPage, direction === 'grant' ? '정말 줄까요?' : '정말 뺏을까요?');
    await expect(confirm).toBeVisible();
    return confirm;
}

test(`${E(64)} 회원 상세 → 골드 +100 → 지갑 숫자 +100, 플레이어 상점 잔액 +100 @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const before = (await store.wallet(U(player))).gold;
    const w = await k.openAdmin(browser);
    try {
        await k.openMember(w.page, player);
        await expect(walletBox(w.page).getByTestId('wallet-gold')).toHaveText(before.toLocaleString('ko-KR'));
        const confirm = await adjustUi(w.page, { direction: 'grant', amount: 100, reason: '버그 보상' });
        await confirm.getByRole('button', { name: '주기', exact: true }).click();
        await expect(confirm).toBeHidden();
        await expect(walletBox(w.page).getByTestId('wallet-gold')).toHaveText((before + 100).toLocaleString('ko-KR'));
        await expectReadable(walletBox(w.page).getByTestId('wallet-gold'));
        expect((await store.wallet(U(player))).gold).toBe(before + 100);
        await store.gotoStore(player.page);
        await expect(store.balance(player.page, '골드', before + 100)).toBeVisible();
    } finally {
        await w.close();
    }
});

test(`${E(65)} 잔액 50에 −51 → 모자람 글, 지갑 50 그대로`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        await setGold(w.page, member.uuid, 50);
        await k.openMember(w.page, member);
        const confirm = await adjustUi(w.page, { direction: 'revoke', amount: 51, reason: '잘못 준 골드' });
        await confirm.getByRole('button', { name: '뺏기', exact: true }).click();
        const refused = confirm.getByRole('alert');
        await expect(refused).toContainText('뺏을 양이 모자라요.');
        await expectReadable(refused);
        await confirm.getByRole('button', { name: '취소', exact: true }).click();
        await expect(walletBox(w.page).getByTestId('wallet-gold')).toHaveText('50');
        expect((await store.wallet(member.uuid)).gold).toBe(50);
    } finally {
        await w.close();
    }
});

test(`${E(66)} 잔액 50에 −50 → 0`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        await setGold(w.page, member.uuid, 50);
        await k.openMember(w.page, member);
        const confirm = await adjustUi(w.page, { direction: 'revoke', amount: 50, reason: '딱 잔액만큼' });
        await confirm.getByRole('button', { name: '뺏기', exact: true }).click();
        await expect(confirm).toBeHidden();
        await expect(walletBox(w.page).getByTestId('wallet-gold')).toHaveText('0');
        await expectReadable(walletBox(w.page).getByTestId('wallet-gold'));
        expect((await store.wallet(member.uuid)).gold).toBe(0);
    } finally {
        await w.close();
    }
});

test(`${E(67)} 주기·뺏기 뒤 상세 장부 → 두 줄 ("관리자 지급"·"관리자 회수")`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser);
    try {
        await k.openMember(w.page, member);
        const give = await adjustUi(w.page, { direction: 'grant', amount: 100, reason: '보상 지급' });
        await give.getByRole('button', { name: '주기', exact: true }).click();
        await expect(give).toBeHidden();
        const take = await adjustUi(w.page, { direction: 'revoke', amount: 30, reason: '일부 회수' });
        await take.getByRole('button', { name: '뺏기', exact: true }).click();
        await expect(take).toBeHidden();

        const ledger = k.listRows(w.page, '최근 장부');
        const granted = ledger.filter({ hasText: '관리자 지급' });
        const revoked = ledger.filter({ hasText: '관리자 회수' });
        await expect(granted).toHaveCount(1);
        await expect(revoked).toHaveCount(1);
        await expect(granted).toContainText('골드 +100');
        await expect(revoked).toContainText('골드 -30');
        await expectReadable(revoked.getByText('관리자 회수', { exact: true }));
    } finally {
        await w.close();
    }
});
