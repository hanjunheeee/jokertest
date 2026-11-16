'use strict';

// 접속 중 전체 공지 어려운 브라우저 시험 (관리자 PC 창 + 플레이어 2) — "접속 중 전체"로 보내면 둘 다 알림(종)에 제목, 결과 "받는 사람" = 그때 접속 수
// 목록 시험목록/A14-관리자.md 번호 A14-H-005 — 접속한 모두에게 가서 @serial (serial 프로젝트는 혼자 돎) / 모임만: npx playwright test --list tests/admin/a14-announce-online.spec.js
const { test, expect, internal } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a14-kit');

const { H } = k;

test(`${H(5)} 플레이어 둘 접속 → "접속 중 전체" 공지 → 둘 다 알림, 결과 수 = 그때 접속 수 @hard @serial @smoke`, async ({ browser, players }) => {
    test.setTimeout(180_000);
    const people = [await k.openPlayer(players), await k.openPlayer(players)];
    const title = `전체 공지 ${k.rand()}`;
    const w = await k.openAdmin(browser);
    try {
        await k.goMenu(w.page, '공지');
        await w.page.getByLabel('제목', { exact: true }).fill(title);
        await w.page.getByLabel('본문', { exact: true }).fill('접속한 모두에게');
        await w.page.getByRole('radio', { name: '접속 중 전체' }).check();
        await w.page.getByRole('button', { name: '보내기', exact: true }).click();
        const box = k.dialog(w.page, '이 공지를 보낼까요?');
        await expect(box).toContainText('대상: 접속 중 전체');
        // 보내기 바로 전 접속 수 (serial이라 다른 시험 접속이 안 섞임)
        const online = (await internal.live()).onlineCount;
        expect(online).toBeGreaterThanOrEqual(2);
        await box.getByRole('button', { name: '보내기', exact: true }).click();
        await expect(box).toBeHidden();
        const result = w.page.getByRole('status', { name: '발송 결과' });
        const recipients = result.locator('div').filter({ has: w.page.getByText('받는 사람', { exact: true }) }).locator('dd');
        await expect(recipients).toHaveText(String(online));
        await expectReadable(recipients);
    } finally {
        await w.close();
    }
    for (const person of people) {
        const bell = await k.openBell(person.page);
        await expect(k.bellItems(bell, title)).toHaveCount(1);
        await expectReadable(k.bellItems(bell, title).getByText(title, { exact: true }));
    }
});
