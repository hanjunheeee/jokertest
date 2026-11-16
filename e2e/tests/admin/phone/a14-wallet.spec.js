'use strict';

// 관리자 다이아 주기 브라우저 시험 (휴대폰 크기 375×812) — 휴대폰에서 회원 상세 → 다이아 +10 → 지갑 숫자
// 목록 시험목록/A14-관리자.md 번호 A14-E-068 — 모임만: npx playwright test --list tests/admin/phone/a14-wallet.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const store = require('../../store/store-tools');
const k = require('../_a14-kit');

const { E } = k;

test(`${E(68)} 휴대폰 크기 다이아 +10 → 지갑 다이아 +10 @smoke`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const before = (await store.wallet(member.uuid)).diamond;
    const w = await k.openAdmin(browser, { phone: true });
    try {
        await k.openMember(w.page, member);
        const box = w.page.getByRole('region', { name: '골드·다이아' });
        await expect(box.getByTestId('wallet-diamond')).toHaveText(before.toLocaleString('ko-KR'));
        await box.getByLabel('재화', { exact: true }).selectOption('DIAMOND');
        await box.getByLabel('금액', { exact: true }).fill('10');
        await box.getByLabel('사유', { exact: true }).fill('휴대폰 지급');
        await box.getByRole('button', { name: '주기', exact: true }).click();
        const confirm = k.dialog(w.page, '정말 줄까요?');
        await expect(confirm).toContainText('재화: 다이아');
        await confirm.getByRole('button', { name: '주기', exact: true }).click();
        await expect(confirm).toBeHidden();
        await expect(box.getByTestId('wallet-diamond')).toHaveText((before + 10).toLocaleString('ko-KR'));
        await expectReadable(box.getByTestId('wallet-diamond'));
        expect((await store.wallet(member.uuid)).diamond).toBe(before + 10);
    } finally {
        await w.close();
    }
});
