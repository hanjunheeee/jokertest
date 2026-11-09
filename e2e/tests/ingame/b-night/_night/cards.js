'use strict';

// 밤 시험 카드·안내 창 파일, 카드 상태 읽기·막고 있는 안내 창 닫기·카드 메뉴로 밤 행동·밤 건너뛰기 누르기
// _night/index.js가 다시 내보냄 (b-night 시험은 require('./_night')로 씀)
const { expect } = require('@playwright/test');
const { sleep } = require('../../../../helpers/wait');

/** 카드 누름 칸 (닉네임으로) */
function cardButton(page, nickname) {
    return page.locator('[role="button"][aria-haspopup="menu"]').filter({ has: page.locator(`[data-ingame-player-nickname="${nickname}"]`) });
}

/** 카드 상태 칸 (data-ingame-player-status: alive·dead·disconnected) */
function cardStatus(page, nickname) {
    return page.locator(`[data-ingame-player-nickname="${nickname}"]`);
}

/** 카드가 그 상태가 될 때까지 */
async function expectCard(page, nickname, status, timeout = 15000) {
    await expect(cardStatus(page, nickname)).toHaveAttribute('data-ingame-player-status', status, { timeout });
}

/** 떠 있는 안내 창 확인 눌러 닫기, 닫은 수 돌려줌 */
async function closeNotices(page, { names = ['단계 전환 안내', '밤 역할 안내'] } = {}) {
    let closed = 0;
    for (const name of names) {
        const dialog = page.getByRole('dialog', { name });
        if (await dialog.isVisible().catch(() => false)) {
            await dialog.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
            closed += 1;
        }
    }
    return closed;
}

/** 밤 성공 연출 끝 '최종 결과' 창 뜨면 확인 (광대·대상이 보는 창, 이름이 '밤 조사 결과'와 같아 따로 찾음) */
async function closeFinalStatus(page) {
    const final = page.locator('[data-ingame-night-success-final]');
    // 감싼 div는 크기가 없어 isVisible이 늘 거짓 → 개수로 봄
    if ((await final.count()) > 0) await final.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
}

/** 역할 공개 창 닫기 (떠 있으면) */
async function closeRoleReveal(page) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '확인' }).click().catch(() => {});
}

/** '사망 후 선택' 창 뜨면 관전 계속하기 */
async function keepWatching(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '관전 계속하기' }).click().catch(() => {});
}

/** 카드 눌러 메뉴 열기 → 메뉴 locator (안내 창이 막고 있으면 닫으면서 다시) */
async function openCardMenu(page, nickname, { timeout = 25000 } = {}) {
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(async () => {
        await closeRoleReveal(page);
        await closeNotices(page);
        await closeFinalStatus(page);
        await keepWatching(page);
        if (!(await menu.isVisible().catch(() => false))) {
            await cardButton(page, nickname).click({ timeout: 1500 });
        }
        await expect(menu).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    return menu;
}

/**
 * 카드를 눌러도 메뉴가 안 열리는지 (안내 창 닫고 눌러 본 뒤 잠깐 봄)
 */
async function expectNoCardMenu(page, nickname) {
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(async () => {
        await closeRoleReveal(page);
        await closeNotices(page);
        await closeFinalStatus(page);
        await keepWatching(page);
        await cardButton(page, nickname).click({ timeout: 1500 });
    }).toPass({ timeout: 25000 });
    await sleep(600);
    if (await menu.isVisible().catch(() => false)) {
        const items = await menu.getByRole('menuitem').allInnerTexts().catch(() => []);
        throw new Error(`메뉴가 열림: [${items.join(', ')}]`);
    }
}

/**
 * 밤 행동 화면으로 내기: 카드 누름 → 메뉴의 '암살'·'보호'·'조사'·'확인'
 */
async function nightActUi(page, nickname, label) {
    const menu = await openCardMenu(page, nickname);
    const item = menu.getByRole('menuitem', { name: label, exact: true });
    await expect(item).toBeEnabled();
    await item.click();
    await expect(menu).toBeHidden();
}

/** 밤 건너뛰기 버튼 */
function skipButton(page) {
    return page.locator('[data-ingame-phase-action="nightSkip"]');
}

/** 밤 건너뛰기 버튼 누르기 (안내 창 닫으면서) */
async function nightSkipUi(page) {
    const skip = skipButton(page);
    await expect(async () => {
        await closeNotices(page);
        await expect(skip).toBeEnabled({ timeout: 1000 });
        await skip.click({ timeout: 1000 });
    }).toPass({ timeout: 25000 });
}

module.exports = {
    cardButton, cardStatus, expectCard, closeNotices, closeFinalStatus, closeRoleReveal, keepWatching,
    openCardMenu, expectNoCardMenu, nightActUi, skipButton, nightSkipUi,
};
