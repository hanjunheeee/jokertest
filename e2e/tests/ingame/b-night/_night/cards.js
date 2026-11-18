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

/** 낮 시작 연출 글 창('지난밤 아무 일도 일어나지 않았습니다' 등) 뜨면 확인 (모두가 보는 창, 이름이 다른 양피지 창과 같아 표시로 찾음) */
async function closeDawnReport(page) {
    const report = page.locator('[data-ingame-dawn-report]');
    // 감싼 div는 크기가 없어 isVisible이 늘 거짓 → 개수로 봄
    if ((await report.count()) > 0) await report.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
}

// 역할 창이 더는 저절로 안 뜨는 것으로 본 화면 (주소 바뀌면 다시 봄)
const revealSettled = new WeakSet();
const revealWatched = new WeakSet();
// 판 상태가 막 온 때 창이 그려질 틈
const REVEAL_GRACE_MS = 1500;

/**
 * 역할 공개 창 닫기 (떠 있으면, 아직 뜰 수 있으면 잠깐 기다렸다가)
 * 창은 판 상태(카드)를 처음 받은 바로 뒤 뜸 → 판 차리자마자·새 기기로 들어온 직후엔 늦게 떠서 낮까지 남을 수 있음
 * 카드가 안 왔으면 카드나 창까지(10초), 그 뒤 1.5초 더 봄 — 한 화면에서 한 번만, 그 뒤 부름은 떠 있는지만 봄 (되풀이로 불러도 안 느려짐)
 */
async function closeRoleReveal(page) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    if (!revealWatched.has(page)) {
        revealWatched.add(page);
        page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) revealSettled.delete(page); });
    }
    let shown = await dialog.isVisible().catch(() => false);
    if (!shown && !revealSettled.has(page) && /\/ingame/.test(page.url())) {
        const cards = page.locator('[data-ingame-player-nickname]');
        if ((await cards.count().catch(() => 0)) === 0) {
            await dialog.or(cards).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        }
        shown = await dialog.waitFor({ state: 'visible', timeout: REVEAL_GRACE_MS }).then(() => true, () => false);
        revealSettled.add(page);
    }
    if (!shown) return;
    // 한 번 뜬 창은 그 화면에서 다시 저절로 안 뜸
    revealSettled.add(page);
    await dialog.getByRole('button', { name: '확인' }).click().catch(() => {});
    await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
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
        await closeDawnReport(page);
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
        await closeDawnReport(page);
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
 * 카드 메뉴의 밤 행동 단추 ('암살'·'보호'·'조사'·'확인')
 * PC는 읽기 이름 앞에 대상 이름이 붙음("닉네임 암살"·"닉네임 · 동료 의사 보호"), 모바일은 글 그대로 → 이름 끝이 그 글인 단추로 찾음
 * ('취소하기'·'취소'는 안 걸림, 보이는 글은 PC·모바일 둘 다 그대로)
 */
function nightMenuItem(menu, label) {
    return menu.getByRole('menuitem', { name: new RegExp(`(^| )${label}$`) });
}

/**
 * 밤 행동 화면으로 내기: 카드 누름 → 메뉴의 '암살'·'보호'·'조사'·'확인'
 */
async function nightActUi(page, nickname, label) {
    const menu = await openCardMenu(page, nickname);
    const item = nightMenuItem(menu, label);
    await expect(item).toBeEnabled();
    await item.click();
    await expect(menu).toBeHidden();
}

/** 밤 건너뛰기 버튼 (산 사람의 내 차례에만 그려짐, 죽은 사람 화면엔 없음) */
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
    cardButton, cardStatus, expectCard, closeNotices, closeDawnReport, closeRoleReveal, keepWatching,
    openCardMenu, expectNoCardMenu, nightMenuItem, nightActUi, skipButton, nightSkipUi,
};
