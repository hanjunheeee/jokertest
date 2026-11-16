'use strict';

// 관리자 두 명이 판 골드를 거의 같이 바꾸는 어려운 브라우저 시험 (관리자 PC 창 2) — 최종 값 하나, 처리 이력 두 줄의 전후 값이 이어짐(1→2→3 또는 1→3→2)
// 목록 시험목록/A14-관리자.md 번호 A14-H-003 ([지금 동작] 줄 잠금으로 차례대로) — 판 골드는 서버 전체 값이라 @serial, 끝에 1로 되돌림 / 모임만: npx playwright test --list tests/admin/a14-game-settings-race.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a14-kit');

const { H } = k;

// 판 설정 화면에서 값 넣고 확인 창까지 → 확인 창 "바꾸기" 단추
async function readyToChange(page, value) {
    await k.goMenu(page, '판 설정');
    await expect(page.getByTestId('game-settings-gold')).toHaveText('1골드');
    const form = page.getByRole('form', { name: '판 골드 바꾸기' });
    await form.getByLabel('판마다 주는 골드').fill(String(value));
    await form.getByRole('button', { name: '바꾸기' }).click();
    const box = k.dialog(page, '판 골드를 바꿀까요?');
    await expect(box).toContainText(`1골드 → ${value}골드`);
    return box.getByRole('button', { name: '바꾸기', exact: true });
}

// 처리 이력에서 그 관리자의 "판 골드 바꿈" 줄을 펼쳐 전·후 값 → { before, after }
async function goldChange(page, admin) {
    const rows = await k.auditRows(page, admin);
    const line = rows.filter({ hasText: '판 골드 바꿈' });
    await expect(line).toHaveCount(1);
    await line.getByText('전후 값 보기').click();
    const read = async (i) => Number(/"goldReward":\s*(\d+)/.exec(await line.locator('pre').nth(i).innerText())?.[1]);
    await expectReadable(line.locator('pre').nth(1));
    return { before: await read(0), after: await read(1) };
}

test(`${H(3)} [지금 동작] 관리자 창 둘이 2·3으로 거의 같이 → 최종 값 하나, 처리 이력 두 줄 전후 값이 이어짐 @hard @serial @smoke`, async ({ browser }) => {
    test.setTimeout(180_000);
    const [one, two] = [await k.openAdmin(browser), await k.openAdmin(browser)];
    try {
        await k.adminApi(one.page, 'PUT', '/game-settings', { goldReward: 1 });
        const pressTwo = await readyToChange(one.page, 2);
        const pressThree = await readyToChange(two.page, 3);
        await Promise.all([pressTwo.click(), pressThree.click()]);
        await expect(k.dialog(one.page, '판 골드를 바꿀까요?')).toBeHidden();
        await expect(k.dialog(two.page, '판 골드를 바꿀까요?')).toBeHidden();

        const final = await k.goldSetting();
        expect([2, 3]).toContain(final);
        const a = await goldChange(one.page, one.admin);
        const b = await goldChange(two.page, two.admin);
        expect(a.after).toBe(2);
        expect(b.after).toBe(3);
        // 먼저 저장된 줄은 1에서, 나중 줄은 먼저 줄의 후 값에서 시작 (1→2→3 또는 1→3→2)
        const [first, second] = a.before === 1 ? [a, b] : [b, a];
        expect(first.before).toBe(1);
        expect(second.before).toBe(first.after);
        expect(final).toBe(second.after);
    } finally {
        await k.adminApi(one.page, 'PUT', '/game-settings', { goldReward: 1 }).catch(() => {});
        await one.close();
        await two.close();
    }
});
