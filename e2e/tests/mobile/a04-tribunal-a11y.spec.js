'use strict';

// 모바일 재판 접근성 시험: 유죄·무죄 단추가 이름으로 찾힘, 움직임 줄이기 설정이면 재판 처음 단계를 건너뛰고 바로 단추
// 목록 A04-E-136·139 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');
const { waitTrialTalk } = require('./_talk');

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

// 합친 뒤 세로 카톡형: 처음 단계는 고발 연출(피고 지목 글·초상 크게, 모양 값 enter → exit)이고 옛 "split" 값은 없음
// 움직임 줄이기면 연출을 아예 안 그리고 바로 "최후의 변론" 단추(시트 안 유죄·무죄)·채팅 입력 줄 (frontend-mobile hooks/overlays/useTribunalTalkSequence.js)
test('A04-E-139 움직임 줄이기면 재판 처음 단계(고발 연출)를 건너뛰고 바로 단추·채팅 (모바일 5명) @game', async ({ user, table }) => {
    const page = user.page;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const t = await A.openTable(table, { humans: [user], bots: 4, roles: A.plainRoles() });
    await A.toVote(t, 1);
    // 재판 연출 창이 뜨는 순간부터 창 모양을 적어 둠 (세로: enter = 고발 연출 등장, exit = 퇴장)
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
    // 연출 없이 바로 "최후의 변론" 단추가 뜨고 채팅 입력 줄이 풀림
    await expect(page.getByTestId('tribunal-presentation-open')).toBeVisible({ timeout: 15000 });
    await waitTrialTalk(page);
    await A.openTrial(page);
    await expect(trial.button(page, 'GUILTY')).toBeVisible();
    await expect(trial.button(page, 'NOT_GUILTY')).toBeEnabled();
    // 처음 단계(고발 연출)를 한 번도 안 거침
    expect(await page.evaluate(() => window.__trialLayouts)).toEqual([]);
});
