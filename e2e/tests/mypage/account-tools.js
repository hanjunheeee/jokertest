'use strict';

// 계정 관리 화면 시험 도구 파일, /account 열기·칸(섹션) 찾기
// tests/mypage 계정 시험들이 씀
const { expect } = require('@playwright/test');
const { skipIntro } = require('../../helpers/ui');

/** 계정 관리 화면 열기 (지금 이메일이 보일 때까지) */
async function gotoAccount(page, path = '/account') {
    await page.goto(path);
    await skipIntro(page);
    await expect(page.getByText(/지금 이메일: .+@/)).toBeVisible();
}

/** 제목으로 칸 찾기 (예: '닉네임 변경') */
const section = (page, heading) => page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });

module.exports = { gotoAccount, section };
