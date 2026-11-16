'use strict';

// 문의 → 답 → 알림 왕복 어려운 브라우저 시험 (관리자 PC 창 + 플레이어 PC 창 + 같은 계정 모바일 창) — PC 문의 창으로 쓰기 → 관리자 답 → PC 알림 → 모바일 내 문의 "답함"
// 목록 시험목록/A14-관리자.md 번호 A14-H-008 — 모임만: npx playwright test --list tests/admin/a14-inquiry-roundtrip.spec.js
const { test, expect, openPerson } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { skipIntro } = require('../../helpers/ui');
const k = require('./_a14-kit');

const { H } = k;

test(`${H(8)} PC 플레이어 문의 → 관리자 답 → PC 알림 → 모바일 같은 계정 내 문의 "답함" @hard @smoke`, async ({ browser, players }) => {
    test.setTimeout(180_000);
    const pc = await k.openPlayer(players);
    const title = `왕복 문의 ${k.rand()}`;
    const answer = `왕복 답 ${k.rand()}`;

    // PC 로비 "고객센터" → 문의 쓰기
    await pc.page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '고객센터' }).click();
    const win = pc.page.getByRole('dialog', { name: '고객센터 문의' });
    await expect(win).toBeVisible();
    await win.getByTestId('inquiry-tab-form').click();
    await win.getByRole('radio', { name: '버그' }).click();
    await win.getByTestId('inquiry-title').fill(title);
    await win.getByTestId('inquiry-body').fill('판 화면이 멈춰요');
    await win.getByTestId('inquiry-submit').click();
    await expect(win.getByTestId('inquiry-notice').or(win.getByTestId('inquiry-message'))).toContainText('문의를 보냈어요.');

    const w = await k.openAdmin(browser);
    try {
        await k.goMenu(w.page, '문의');
        const row = k.listRows(w.page, '문의 목록').filter({ hasText: title });
        await expect(row).toContainText('답 기다림');
        await row.getByRole('link', { name: title }).click();
        await w.page.getByLabel('답', { exact: true }).fill(answer);
        await w.page.getByRole('button', { name: '답 보내기' }).click();
        await expect(w.page.getByRole('status').filter({ hasText: '답을 달았어요.' })).toBeVisible();
    } finally {
        await w.close();
    }

    // PC: 알림 종 → 문의 답 알림
    await pc.page.getByRole('button', { name: '문의 창 닫기' }).first().click().catch(() => {});
    const bell = await k.openBell(pc.page);
    const item = k.bellItems(bell, title).filter({ hasText: '문의에 답이 왔어요' });
    await expect(item).toHaveCount(1);
    await expectReadable(item.getByText('문의에 답이 왔어요', { exact: true }));

    // 모바일: 같은 계정으로 문의 창 → 그 문의 "답함"·운영팀 답
    const { inquiries } = (await k.playerCall(pc, 'GET', '/inquiries')).body;
    const mine = inquiries.find((q) => q.title === title);
    expect(mine?.status).toBe('ANSWERED');
    const mobile = await openPerson(browser, { mobile: true, account: pc.account });
    try {
        await mobile.page.goto(`/lobby?inquiryId=${mine.id}`);
        await skipIntro(mobile.page);
        const detail = mobile.page.getByTestId('inquiry-detail');
        await expect(detail).toContainText('답함');
        const replies = detail.getByRole('list', { name: '운영팀 답' });
        await expect(replies).toContainText(answer);
        await expect(replies).toContainText('운영팀');
        await expectReadable(replies.getByText(answer, { exact: true }));
    } finally {
        await mobile.context.close();
    }
});
