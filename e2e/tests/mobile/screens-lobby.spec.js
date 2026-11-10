// 모바일 로비 (375×812 세로): 하단 광고 자리 위치, 메뉴 이동, 알림·친구 시트, 마이페이지·고객센터 버튼
const { test, expect } = require('../../helpers/fixtures');
const { overflowX } = require('./_talk');

const menu = (page) => page.getByRole('navigation', { name: '로비 메뉴' });

test.describe('모바일 로비', () => {
    test('로비 하단 광고 자리는 → 화면 바닥에 붙어 있고 로비 메뉴와 안 겹침', async ({ user }) => {
        const ad = await user.page.getByRole('complementary', { name: '광고' }).boundingBox();
        const nav = await menu(user.page).boundingBox();
        expect(ad.y + ad.height).toBeGreaterThan(812 - 90);
        expect(ad.y + ad.height).toBeLessThanOrEqual(812 + 1);
        expect(nav.y + nav.height).toBeLessThanOrEqual(ad.y + 1);
        expect(ad.width).toBeLessThanOrEqual(375);
    });

    for (const [name, path] of [['설정', /\/setting$/], ['상점', /\/store$/], ['기억의 서고', /\/library$/]]) {
        test(`로비 메뉴 "${name}"을 누르면 → 그 화면으로 가고 가로로 안 넘침`, async ({ user }) => {
            await menu(user.page).getByRole('button', { name }).click();
            await expect(user.page).toHaveURL(path);
            await expect(user.page.getByRole('button', { name: /뒤로 가기|로비로 돌아가기/ }).first()).toBeVisible();
            expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
        });
    }

    test('로비 위 "마이페이지"(내 닉네임)를 누르면 → 마이페이지로 감', async ({ user }) => {
        const btn = user.page.getByRole('button', { name: '마이페이지' });
        await expect(btn).toContainText(user.account.nickname);
        await btn.click();
        await expect(user.page).toHaveURL(/\/mypage$/);
    });

    test('새 계정 로비 알림 버튼은 → 읽지 않음 개수를 알려 주고 누르면 알림 시트가 열림', async ({ user }) => {
        const bell = user.page.getByRole('button', { name: /^알림/ });
        await expect(bell).toHaveAccessibleName(/읽지 않음 \d+개/);
        await bell.click();
        const sheet = user.page.getByRole('dialog', { name: '알림' });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole('listitem').first()).toBeVisible();
        const box = await sheet.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(375);
    });

    test('알림 시트 닫기를 누르면 → 시트가 닫히고 읽지 않음 표시가 사라짐', async ({ user }) => {
        await user.page.getByRole('button', { name: /^알림/ }).click();
        const sheet = user.page.getByRole('dialog', { name: '알림' });
        await sheet.getByRole('button', { name: '닫기' }).click();
        await expect(sheet).toHaveCount(0);
        await expect(user.page.getByRole('button', { name: /^알림/ })).toHaveAccessibleName('알림');
    });

    test('"친구 목록"을 누르면 → 친구 시트에 탭 넷(친구 추가·요청 수락·게임 초대·차단 목록)과 친구 검색이 보임', async ({ user }) => {
        await user.page.getByRole('button', { name: '친구 목록' }).click();
        const sheet = user.page.getByRole('dialog', { name: '친구 목록' });
        await expect(sheet).toBeVisible();
        const tabs = sheet.getByRole('tablist', { name: '친구 목록 탭' });
        for (const name of ['친구 추가', '요청 수락', '게임 초대', '차단 목록']) await expect(tabs.getByRole('tab', { name })).toBeVisible();
        await expect(sheet.getByRole('searchbox', { name: '친구 검색' })).toBeVisible();
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('친구 시트 "친구 추가" 탭에서 다른 계정 닉네임을 찾으면 → 그 계정이 후보로 보임', async ({ user, accounts }) => {
        const other = await accounts.create();
        await user.page.getByRole('button', { name: '친구 목록' }).click();
        const sheet = user.page.getByRole('dialog', { name: '친구 목록' });
        await sheet.getByRole('tab', { name: '친구 추가' }).click();
        // 탭을 바꾸면 창 이름이 그 탭 이름('친구 신청')으로 바뀜 (getAriaLabel)
        const addSheet = user.page.getByRole('dialog', { name: '친구 신청' });
        const search = addSheet.getByRole('searchbox').first();
        await search.fill(other.nickname);
        await search.press('Enter');
        await expect(addSheet.getByText(other.nickname)).toBeVisible({ timeout: 10000 });
    });
});
