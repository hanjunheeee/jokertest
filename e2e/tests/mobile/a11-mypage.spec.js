'use strict';

// 모바일 마이페이지 브라우저 시험: 배너로 들어감·"계정 관리"·"프로필 수정" 시트(주소 ?sheet=)·전적 칸·바닥 단추 글이 읽힘
// 목록 A11b 브라우저 간단 A11-E-576~579·604 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a11-mypage.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('../auth/_a11b-kit');

test('A11-E-576 모바일 배너 → /mypage @smoke', async ({ user }) => {
    const { page } = user;
    await k.banner(page).click();
    await expect(page).toHaveURL(/\/mypage$/);
});

test('A11-E-577 모바일 "계정 관리" → /account', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    await page.getByRole('button', { name: '계정 관리', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(/지금 이메일: .+@/)).toBeVisible();
});

test('A11-E-578 모바일 "프로필 수정" → 시트 열림, 주소 ?sheet=profile-edit', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '프로필 수정' })).toBeVisible();
    await expect(page).toHaveURL(/[?&]sheet=profile-edit(&|$)/);
});

test('A11-E-579 모바일 전적 칸에 판수·승률 보임', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    await expect(k.statValue(page, '전체 판수')).toHaveText('0');
    await expect(k.statValue(page, '승률')).toHaveText('0.0%');
    // 전적 글 칸은 누름이 안 먹게(pointer-events:none) 해 둬서 가려짐 검사만 끔
    await expectReadable(k.statValue(page, '전체 판수'), { uncovered: false });
    await expectReadable(k.statValue(page, '승률'), { uncovered: false });
});

test('A11-E-604 모바일 마이페이지 단추 4개 글이 읽힘', async ({ user }) => {
    const { page } = user;
    await k.gotoMyPage(page);
    for (const name of k.MYPAGE_BUTTONS) {
        await k.expectLabelReadable(page.getByRole('button', { name, exact: true }), name);
    }
});
