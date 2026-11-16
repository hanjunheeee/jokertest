'use strict';

// 관리자 판 설정(판마다 골드) 브라우저 시험 (PC 크기) — 지금 값·이 서버가 쓰는 값, 1 → 2 확인 창·처리 이력, 범위 밖 글, 0으로, 서버별 반영 줄
// 목록 시험목록/A14-관리자.md 번호 A14-E-069~074 — 판 골드는 서버 전체 값이라 전부 @serial, 바꾼 시험은 끝에 1로 되돌림 / 모임만: npx playwright test --list tests/admin/a14-game-settings-admin.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a14-kit');

const { E, TEXT } = k;
const now = (page) => page.getByTestId('game-settings-gold');
const form = (page) => page.getByRole('form', { name: '판 골드 바꾸기' });
const confirmBox = (page) => k.dialog(page, '판 골드를 바꿀까요?');

// 판 설정 화면 열고 시험 → 바꾼 시험은 끝에 1로 (관리자 API)
async function withSettings(browser, run, { restore = false } = {}) {
    const w = await k.openAdmin(browser);
    try {
        await k.adminApi(w.page, 'PUT', '/game-settings', { goldReward: 1 });
        await k.goMenu(w.page, '판 설정');
        await expect(k.heading(w.page, '판 설정')).toBeVisible();
        await expect(now(w.page)).toHaveText('1골드');
        await run(w);
    } finally {
        try { if (restore) await k.adminApi(w.page, 'PUT', '/game-settings', { goldReward: 1 }); } finally { await w.close(); }
    }
}

// 값 넣고 바꾸기 → 확인 창
async function ask(page, value) {
    await form(page).getByLabel('판마다 주는 골드').fill(String(value));
    await form(page).getByRole('button', { name: '바꾸기' }).click();
    await expect(confirmBox(page)).toBeVisible();
    return confirmBox(page);
}

test(`${E(69)} 메뉴 "판 설정" → "1골드", "이 서버가 쓰는 값" @serial @smoke`, async ({ browser }) => {
    await withSettings(browser, async ({ page }) => {
        await expectReadable(now(page));
        await expectReadable(page.getByText('이 서버가 쓰는 값', { exact: true }));
        const used = page.locator('dt', { hasText: '이 서버가 쓰는 값' }).locator('xpath=following-sibling::dd[1]');
        await expect(used).toHaveText('1골드');
        await expectReadable(used);
    }, { restore: true });
});

test(`${E(70)} 1 → 2 바꾸기 → 확인 창 "1골드 → 2골드" → 바꾸기 → "2골드", 처리 이력 맨 위 "판 골드 바꿈" @serial`, async ({ browser }) => {
    await withSettings(browser, async ({ page, admin }) => {
        const box = await ask(page, 2);
        await expectReadable(box.getByText('1골드 → 2골드', { exact: true }));
        await box.getByRole('button', { name: '바꾸기', exact: true }).click();
        await expect(box).toBeHidden();
        await expect(now(page)).toHaveText('2골드');
        expect(await k.goldSetting()).toBe(2);
        // 이 시험 관리자 줄만 거르면 맨 위가 방금 바꾼 것
        const rows = await k.auditRows(page, admin);
        await expect(rows.first()).toContainText('판 골드 바꿈');
        await expectReadable(rows.first().getByText('판 골드 바꿈', { exact: true }));
    }, { restore: true });
});

// A14-E-071~072: 범위 밖 → 글이 읽히고 확인 창 없음·값 그대로
[[71, '101'], [72, '-1']].forEach(([no, value]) => {
    test(`${E(no)} 판 골드에 ${value} → "0부터 100까지 정수로 넣어 주세요."가 읽힘, 값 그대로 @serial`, async ({ browser }) => {
        await withSettings(browser, async ({ page }) => {
            await form(page).getByLabel('판마다 주는 골드').fill(value);
            await form(page).getByRole('button', { name: '바꾸기' }).click();
            await expectReadable(form(page).getByText(TEXT.rangeError, { exact: true }));
            await expect(confirmBox(page)).toHaveCount(0);
            await expect(now(page)).toHaveText('1골드');
            expect(await k.goldSetting()).toBe(1);
        });
    });
});

test(`${E(73)} 0으로 바꾸기 → "0골드", 처리 이력 줄 @serial`, async ({ browser }) => {
    await withSettings(browser, async ({ page, admin }) => {
        const box = await ask(page, 0);
        await expect(box).toContainText('1골드 → 0골드');
        await box.getByRole('button', { name: '바꾸기', exact: true }).click();
        await expect(box).toBeHidden();
        await expect(now(page)).toHaveText('0골드');
        await expectReadable(now(page));
        expect(await k.goldSetting()).toBe(0);
        const rows = await k.auditRows(page, admin);
        await expect(rows.filter({ hasText: '판 골드 바꿈' })).toHaveCount(1);
    }, { restore: true });
});

test(`${E(74)} 바꾼 뒤 "서버별 반영" 줄 "반영됨" @serial`, async ({ browser }) => {
    await withSettings(browser, async ({ page }) => {
        const box = await ask(page, 2);
        await box.getByRole('button', { name: '바꾸기', exact: true }).click();
        await expect(box).toBeHidden();
        const results = page.getByRole('region', { name: '서버별 반영', exact: true });
        const ok = results.getByRole('listitem').filter({ hasText: /반영됨$/ });
        await expect(ok.first()).toBeVisible();
        await expect(results.getByRole('listitem').filter({ hasText: '반영 안 됨' })).toHaveCount(0);
        await expectReadable(ok.first());
    }, { restore: true });
});
