'use strict';

// 관리자 회원 상세 브라우저 시험 (휴대폰 크기 375×812) — 찾기 → 상세가 카드 모양, 정지 기록 카드·탈주 기록 칸
// 목록 시험목록/A14-관리자.md 번호 A14-E-021 — 모임만: npx playwright test --list tests/admin/phone/a14-members.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const k = require('../_a14-kit');

const { E, U } = k;

test(`${E(21)} 휴대폰 크기 찾기 → 상세 카드 모양, 정지 기록·탈주 기록 칸 @smoke`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser, { phone: true });
    try {
        // 정지 기록 줄이 하나 있게 (정지 → 해제)
        await k.adminApi(w.page, 'POST', `/members/${U(member)}/bans`, { kind: 'PERIOD', days: 7, reason: '시험 정지' });
        await k.adminApi(w.page, 'POST', `/members/${U(member)}/unban`, { reason: '시험 해제' });
        await k.goMenu(w.page, '회원');
        await w.page.getByRole('search').getByLabel('찾을 회원').fill(member.uuid);
        await w.page.getByRole('search').getByRole('button', { name: '찾기' }).click();
        const found = w.page.getByRole('list', { name: '찾은 회원 목록' }).getByRole('listitem');
        await expect(found).toHaveCount(1);
        await found.getByRole('link', { name: member.nickname }).click();
        await expectReadable(k.heading(w.page, member.nickname));

        // 휴대폰은 표 대신 카드
        await expect(w.page.getByRole('table')).toHaveCount(0);
        const bans = w.page.getByRole('list', { name: '정지 기록' }).getByRole('listitem');
        await expect(bans).toHaveCount(1);
        await expect(bans).toContainText('시험 해제');
        await expectReadable(bans.getByText('시험 해제', { exact: true }));
        await expectReadable(w.page.getByRole('heading', { level: 2, name: '탈주 기록', exact: true }));
        await expectReadable(w.page.getByText('탈주 기록이 없어요.', { exact: true }));
        await k.expectNoSideScroll(w.page);
    } finally {
        await w.close();
    }
});
