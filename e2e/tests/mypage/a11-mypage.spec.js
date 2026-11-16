'use strict';

// 마이페이지 브라우저 시험 (PC): 배너로 들어감·단추 넷 순서·"계정 관리"·"프로필 수정" 창·사진 바꾸기·판 뒤 전적·새 계정 전적·전적 글 보임
// 목록 A11b 브라우저 간단 A11-E-560~567 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-mypage.spec.js)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { playToResult } = require('../room/roomHelpers');
const k = require('../auth/_a11b-kit');

test('A11-E-560 로비 배너 누름 → /mypage @smoke', async ({ user }) => {
    const { page } = user;
    await k.banner(page).click();
    await expect(page).toHaveURL(/\/mypage$/);
});

test('A11-E-561 마이페이지 단추 4개가 보이고 순서는 "계정 관리"·"프로필 수정"·"스킨&카드 착용"·"이모티콘"', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    const names = new RegExp(`^(${k.MYPAGE_BUTTONS.join('|')})$`); // → /^(계정 관리|프로필 수정|스킨&카드 착용|이모티콘)$/
    const buttons = page.getByRole('button', { name: names });
    await expect(buttons).toHaveText([...k.MYPAGE_BUTTONS]);
    for (const name of k.MYPAGE_BUTTONS) {
        await k.expectLabelReadable(page.getByRole('button', { name, exact: true }), name);
    }
});

test('A11-E-562 "계정 관리" → /account', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    await page.getByRole('button', { name: '계정 관리', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
});

test('A11-E-563 "프로필 수정" → 꾸미기 창 + 탭 둘 → 닫기 → 마이페이지', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '프로필 수정' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tablist', { name: '프로필 수정 옵션' }).getByRole('tab')).toHaveText(['프로필 수정', '테두리 수정']);
    await dialog.getByRole('button', { name: '프로필 수정 닫기' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/mypage$/);
    await expect(page.getByRole('button', { name: '계정 관리', exact: true })).toBeVisible();
});

test('A11-E-564 꾸미기 창에서 가진 사진 고름 → 저장 → 배너 사진 바뀜, 새로고침 뒤에도', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '프로필 수정' });
    // 지금 안 끼고 있는 사진 하나 고름 (기본 지급으로 사진은 다 가짐)
    const option = dialog.getByRole('region', { name: '프로필 이미지 목록' }).locator('button[aria-pressed="false"]').first();
    await expect(option).toBeVisible();
    const picked = k.fileNameOf(await option.locator('img').getAttribute('src'));
    expect(picked).toMatch(/^프로필-.+\.webp$/);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: '수정하기' }).click();
    // 로비 배너의 사진 그림 파일 이름들
    const bannerFiles = async () => (await k.banner(page).locator('img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')))).map(k.fileNameOf);
    await ui.gotoLobby(page);
    await expect.poll(bannerFiles).toContain(picked);
    await page.reload();
    await expect(k.banner(page)).toBeVisible();
    await expect.poll(bannerFiles).toContain(picked);
});

test('A11-E-565 판 하나 끝까지 (5명 판, 사람 1 + 봇 4) → 마이페이지 "전체 판수" 1 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const { t } = await playToResult({ user, table, kind: 'citizenWin' });
    // 180초 규칙을 보는 시험이 아니라 결과 화면은 손잡이로 닫음 → 로비
    await t.closeResults();
    await expect(user.page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    await k.gotoMyPage(user.page);
    await expect(k.statValue(user.page, '전체 판수')).toHaveText('1', { timeout: 15_000 });
});

test('A11-E-566 새 계정 전적: 전체 판수 0, 승률 "0.0%", "전적 없음" 문구', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    await expect(k.statValue(page, '전체 판수')).toHaveText('0');
    await expect(k.statValue(page, '승률')).toHaveText('0.0%');
    await expect(page.getByText('[전적 없음]', { exact: true })).toBeVisible();
});

test('A11-E-567 전적 칸 글이 읽힘', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    // 전적 글 칸은 누름이 안 먹게(pointer-events:none) 해 둬서 가운데 점 검사가 밑 틀 그림을 잡음 → 가려짐 검사만 끔
    for (const label of ['전체 판수', '승률']) {
        await expectReadable(page.getByText(label, { exact: true }), { uncovered: false });
        await expectReadable(k.statValue(page, label), { uncovered: false });
    }
});
