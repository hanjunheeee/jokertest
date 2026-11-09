// 설정(글자 크기·알림·소리 저장 유지·초기화), 이모티콘 팔레트 화면(검색·등급·저장·되돌리기), 기억의 서고
const { test, expect, ui } = require('../../helpers/fixtures');

async function gotoSetting(page) {
    await page.goto('/setting');
    await ui.skipIntro(page);
    await expect(page.getByRole('navigation', { name: '설정 탭' })).toBeVisible();
}

test.describe('설정', () => {
    test('텍스트 크기를 바꾸고 새로 고치면 → 바꾼 값이 그대로', async ({ user }) => {
        const { page } = user;
        await gotoSetting(page);
        const slider = page.getByRole('slider', { name: '텍스트 크기' });
        await slider.focus();
        await page.keyboard.press('ArrowRight');
        await expect(slider).toHaveValue('4');
        await gotoSetting(page);
        await expect(page.getByRole('slider', { name: '텍스트 크기' })).toHaveValue('4');
    });

    test('게임 초대 알림을 끄고 새로 고치면 → 꺼진 채로 있음', async ({ user }) => {
        const { page } = user;
        await gotoSetting(page);
        await page.getByRole('checkbox', { name: '게임 초대' }).uncheck();
        await gotoSetting(page);
        await expect(page.getByRole('checkbox', { name: '게임 초대' })).not.toBeChecked();
        await expect(page.getByRole('checkbox', { name: '친구 초대' })).toBeChecked();
    });

    test('바꾼 뒤 초기화를 누르면 → 글자 크기 3·알림 모두 켜짐으로 돌아감', async ({ user }) => {
        const { page } = user;
        await gotoSetting(page);
        await page.getByRole('checkbox', { name: '시스템 알림' }).uncheck();
        await page.getByRole('slider', { name: '텍스트 크기' }).focus();
        await page.keyboard.press('ArrowLeft');
        await page.getByRole('button', { name: '초기화' }).click();
        await expect(page.getByRole('checkbox', { name: '시스템 알림' })).toBeChecked();
        await expect(page.getByRole('slider', { name: '텍스트 크기' })).toHaveValue('3');
    });

    test('사운드 탭에서 볼륨을 바꾸고 새로 고치면 → 바꾼 값이 그대로', async ({ user }) => {
        const { page } = user;
        await gotoSetting(page);
        await page.getByRole('button', { name: '사운드' }).click();
        const slider = page.getByRole('region', { name: '설정 목록' }).getByRole('slider').first();
        const before = await slider.inputValue();
        await slider.focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        const after = await slider.inputValue();
        expect(after).not.toBe(before);
        await gotoSetting(page);
        await page.getByRole('button', { name: '사운드' }).click();
        await expect(page.getByRole('region', { name: '설정 목록' }).getByRole('slider').first()).toHaveValue(after);
    });
});

test.describe('이모티콘 팔레트 화면', () => {
    async function gotoPalette(page) {
        await page.goto('/mypage/emoticons');
        await ui.skipIntro(page);
        await expect(page.getByRole('region', { name: '이모티콘 팔레트' })).toBeVisible();
    }

    test('처음 열면 → 기본 이모티콘 8개가 슬롯 1~8에, 상점 이모티콘은 미보유로 잠김', async ({ user }) => {
        const { page } = user;
        await gotoPalette(page);
        await expect(page.getByRole('group', { name: '팔레트 슬롯' }).getByRole('button')).toHaveCount(8);
        await expect(page.getByRole('button', { name: '1번 슬롯' }).getByRole('img', { name: '거절' })).toBeVisible();
        await expect(page.getByRole('button', { name: '깜짝 (미보유)' })).toBeDisabled();
    });

    test('검색에 "사랑"을 넣으면 → 사랑만 남고, 등급을 상점으로 하면 기본 이모티콘이 빠짐', async ({ user }) => {
        const { page } = user;
        await gotoPalette(page);
        const list = page.getByRole('list', { name: '이모티콘 목록' });
        await page.getByRole('searchbox', { name: '이모티콘 검색' }).fill('사랑');
        await expect(list.getByRole('listitem')).toHaveCount(1);
        await page.getByRole('searchbox', { name: '이모티콘 검색' }).fill('');
        await page.getByRole('combobox', { name: '이모티콘 등급 필터' }).selectOption('상점');
        await expect(list.getByRole('button', { name: '거절 팔레트에 넣기' })).toHaveCount(0);
        await expect(list.getByRole('button', { name: /깜짝/ })).toBeVisible();
    });

    test('1번 슬롯에 헤롱을 넣고 저장한 뒤 새로 고치면 → 1번 슬롯이 헤롱', async ({ user }) => {
        const { page } = user;
        await gotoPalette(page);
        await page.getByRole('button', { name: '1번 슬롯' }).click();
        await page.getByRole('button', { name: '헤롱 팔레트에 넣기' }).click();
        await expect(page.getByRole('button', { name: '1번 슬롯' }).getByRole('img', { name: '헤롱' })).toBeVisible();
        await page.getByRole('button', { name: '저장' }).click();
        const ok = page.getByRole('dialog');
        await expect(ok).toBeVisible();
        await ok.getByRole('button').first().click();
        await gotoPalette(page);
        await expect(page.getByRole('button', { name: '1번 슬롯' }).getByRole('img', { name: '헤롱' })).toBeVisible();
    });

    test('슬롯을 바꾼 뒤 되돌리기를 누르면 → 저장 전 모양으로 돌아감', async ({ user }) => {
        const { page } = user;
        await gotoPalette(page);
        await page.getByRole('button', { name: '2번 슬롯' }).click();
        await page.getByRole('button', { name: '항복 팔레트에 넣기' }).click();
        await page.getByRole('button', { name: '되돌리기' }).click();
        await expect(page.getByRole('button', { name: '2번 슬롯' }).getByRole('img', { name: '눈물' })).toBeVisible();
    });
});

test.describe('기억의 서고', () => {
    async function gotoLibrary(page) {
        await page.goto('/library');
        await ui.skipIntro(page);
        await expect(page.getByRole('button', { name: '초대받은 자들' })).toBeVisible();
    }

    test('서고에 가면 → 금지된 기록 첫 장(기록 I)과 진행도 0/3, 이전 페이지는 잠김', async ({ user }) => {
        const { page } = user;
        await gotoLibrary(page);
        await expect(page.getByRole('heading', { name: /기록 I/ })).toBeVisible();
        await expect(page.getByText('0/3회 완료')).toBeVisible();
        await expect(page.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
    });

    test('초대받은 자들 → 직업 탭을 광대로 바꾸면 직업 제목·내 전적 0이 보임', async ({ user }) => {
        const { page } = user;
        await gotoLibrary(page);
        await page.getByRole('button', { name: '초대받은 자들' }).click();
        await expect(page.getByRole('heading', { name: '직업 [귀족]' })).toBeVisible();
        await page.getByRole('tab', { name: '광대' }).click();
        await expect(page.getByRole('heading', { name: '직업 [광대]' })).toBeVisible();
        await expect(page.getByRole('row', { name: '플레이 횟수 0' })).toBeVisible();
    });
});
