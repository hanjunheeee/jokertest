// 로비 메뉴 시험: 메뉴 버튼마다 가는 화면·고객센터 버튼·프로필 칸·인트로 영상 건너뛰기·명예의 전당 주소
const { test, expect, ui } = require('../../helpers/fixtures');

const menu = (page) => page.getByRole('navigation', { name: '로비 메뉴' });

test('로그인 뒤 로비에 오면 → 메뉴 다섯 개와 알림·친구 버튼이 보임', async ({ user }) => {
    const { page } = user;
    for (const name of ['게임플레이', '설정', '상점', '기억의 서고', '종료']) {
        await expect(menu(page).getByRole('button', { name })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^알림/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '친구 목록' })).toBeVisible();
});

test.describe('로비 메뉴 이동', () => {
    for (const [name, path] of [
        ['게임플레이', /\/gameMode$/],
        ['설정', /\/setting$/],
        ['상점', /\/store$/],
        ['기억의 서고', /\/library$/],
    ]) {
        test(`${name}을(를) 누르면 → ${path.source.replace(/\\|\$/g, '')} 화면으로 감`, async ({ user }) => {
            const { page } = user;
            await menu(page).getByRole('button', { name }).click();
            await expect(page).toHaveURL(path);
        });
    }

    test('게임플레이 화면에서 뒤로 가기를 하면 → 로비로 돌아오고 인트로 없이 메뉴가 바로 보임', async ({ user }) => {
        const { page } = user;
        await menu(page).getByRole('button', { name: '게임플레이' }).click();
        await expect(page).toHaveURL(/\/gameMode$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/lobby$/);
        await expect(menu(page)).toBeVisible();
        await expect(page.getByRole('button', { name: '인트로 건너뛰기' })).toHaveCount(0);
    });

    // 관리자(2-15): 고객센터가 디스코드 링크 대신 게임 안 문의 창을 엶 (결정.md 2026-11-09 설계) → 예전 링크·잠김 기대를 바꿈
    test('고객센터를 누르면 → 주소는 그대로 로비, 문의 창이 열림', async ({ user }) => {
        const { page } = user;
        await expect(menu(page).getByRole('link', { name: '고객센터' })).toHaveCount(0);
        await menu(page).getByRole('button', { name: '고객센터' }).click();
        await expect(page.getByRole('dialog', { name: '고객센터 문의' })).toBeVisible();
        await expect(page).toHaveURL(/\/lobby$/);
    });
});

test.describe('로비 프로필 칸', () => {
    test('프로필 칸에는 → 내 닉네임이 보임', async ({ user }) => {
        await expect(user.page.getByRole('button', { name: '마이페이지' })).toContainText(user.account.nickname);
    });

    test('프로필 칸을 누르면 → 마이페이지로 감', async ({ user }) => {
        await user.page.getByRole('button', { name: '마이페이지' }).click();
        await expect(user.page).toHaveURL(/\/mypage$/);
    });

    test('프로필 옆 톱니(계정 설정)를 누르면 → 계정 화면으로 감', async ({ user }) => {
        await user.page.getByRole('button', { name: '계정 설정' }).click();
        await expect(user.page).toHaveURL(/\/account$/);
    });
});

test.describe('로비 인트로 영상', () => {
    test('이 브라우저로 처음 로비에 오면 → 인트로 영상이 떠서 메뉴가 안 보임, 건너뛰면 메뉴가 보임', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        await page.goto('/lobby');
        const skip = page.getByRole('button', { name: '인트로 건너뛰기' });
        // 시험이 몰려 느리면 짧은 영상이 먼저 끝날 수 있음 → 그때는 영상이 끝나 본 걸로 남았는지 봄
        await expect(skip.or(menu(page)).first()).toBeVisible();
        if (await skip.isVisible()) {
            // 영상 동안엔 화면 전체가 건너뛰기 칸이라 메뉴를 못 누름 (메뉴는 숨김 상태로 깔려 있음)
            expect(await page.evaluate(() => localStorage.getItem('lobby:intro_done'))).toBeNull();
            await skip.click();
        } else {
            test.info().annotations.push({ type: 'note', description: '영상이 먼저 끝나 건너뛰기 버튼을 못 봄' });
        }
        await expect(menu(page)).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('lobby:intro_done'))).toBe('1');
    });

    test('한 번 건너뛴 뒤 새로 읽으면 → 인트로 없이 메뉴가 바로 보임', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        await ui.gotoLobby(page);
        await page.reload();
        await expect(menu(page)).toBeVisible();
        await expect(page.getByRole('button', { name: '인트로 건너뛰기' })).toHaveCount(0);
    });
});

test('명예의 전당 옛 주소(/podium)를 열면 → 로비로 넘어감', async ({ user }) => {
    await user.page.goto('/podium');
    await expect(user.page).toHaveURL(/\/lobby$/);
    await expect(menu(user.page)).toBeVisible();
});
