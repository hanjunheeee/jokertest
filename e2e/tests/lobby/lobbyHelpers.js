'use strict';

// 로비 시험 도우미 파일, 친구 패널·알림 창 열기 (친구 맺기 준비는 helpers/friends.js 것 다시 내보냄)
// tests/lobby 시험들이 씀 (시험 파일 아님) — 화면으로 보는 부분만 시험에서 누르고, 준비는 여기 API로
const { expect } = require('@playwright/test');
// 친구 맺기·API 부르기는 helpers/friends.js (방 시험도 같이 씀), 옛 이름 그대로 내보냄
const { api, botApi, sendRequest, makeFriends } = require('../../helpers/friends');

// 친구 패널 열기 → 패널(dialog)
async function openFriendPanel(page) {
    await page.getByRole('button', { name: '친구 목록' }).click();
    const panel = page.getByRole('dialog', { name: /친구|게임 초대|차단/ });
    await expect(panel).toBeVisible();
    return panel;
}

// 친구 패널 탭 누르기 (친구 추가·요청 수락·게임 초대·차단 목록)
async function openTab(page, name) {
    await page.getByRole('tablist', { name: '친구 목록 탭' }).getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

// 친구 목록 줄 하나 (닉네임으로)
const friendRow = (page, nickname) => page.getByRole('listitem').filter({ hasText: nickname });

// 알림 창 열기 → dialog
async function openNotifications(page) {
    await page.getByRole('button', { name: /^알림/ }).click();
    const dialog = page.getByRole('dialog', { name: '알림' });
    await expect(dialog).toBeVisible();
    return dialog;
}

/**
 * 알림 항목의 이동 버튼 누르기 — 창을 열면 자동 읽음 요청이 먼저 나가고 그동안 버튼 이름이 '처리 중'이라
 * 읽음이 끝나 버튼이 다시 풀린 뒤에 누름 (그 사이 누르면 이름이 바뀌는 중이라 누름이 빗나감)
 */
async function clickItemAction(item, name) {
    await expect(item).toHaveAttribute('data-notification-read', 'true');
    const button = item.getByRole('button', { name });
    await expect(button).toBeEnabled();
    await button.click();
}

module.exports = { clickItemAction, api, botApi, sendRequest, makeFriends, openFriendPanel, openTab, friendRow, openNotifications };
