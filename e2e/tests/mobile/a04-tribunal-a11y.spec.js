'use strict';

// 모바일 재판 접근성 시험: 유죄·무죄 단추가 이름으로 찾힘, 움직임 줄이기 설정이면 재판 처음 단계를 건너뛰고 바로 단추
// 목록 A04-E-136·139 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-136 유죄·무죄 단추가 역할(button)과 이름으로 찾힘 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    await A.startTrial(table, { humans: [user], bots: 5 });
    for (const name of ['유죄', '무죄']) {
        const button = page.getByRole('button', { name, exact: true });
        await expect(button).toHaveCount(1);
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
    }
});

test('A04-E-139 움직임 줄이기면 재판 처음 단계(카드만 크게)를 건너뛰고 바로 단추·채팅 (모바일 5명) @game', async ({ user, table }) => {
    const page = user.page;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const t = await A.openTable(table, { humans: [user], bots: 4, roles: A.plainRoles() });
    await A.toVote(t, 1);
    // 재판 창이 뜨는 순간부터 창 모양을 적어 둠 (intro = 카드만 크게, split = 채팅까지 열림)
    await page.evaluate(() => {
        window.__trialLayouts = [];
        const scan = () => {
            const el = document.querySelector('[data-ingame-tribunal-presentation]');
            const layout = el ? el.getAttribute('data-ingame-tribunal-layout') : null;
            if (layout && window.__trialLayouts.at(-1) !== layout) window.__trialLayouts.push(layout);
        };
        new MutationObserver(scan).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['data-ingame-tribunal-layout'],
        });
    });
    await A.toTribunal(t, t.bots[3]);
    await expect(trial.button(page, 'GUILTY')).toBeVisible({ timeout: 15000 });
    await expect(trial.button(page, 'NOT_GUILTY')).toBeEnabled();
    await expect(trial.chat(page)).toBeVisible();
    // 처음 단계(intro)를 한 번도 안 거침
    expect(await page.evaluate(() => window.__trialLayouts)).toEqual(['split']);
});
