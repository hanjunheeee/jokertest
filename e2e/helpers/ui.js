'use strict';

// 화면 공통 동작 파일, 데스크톱·모바일 둘 다 되는 고르개로 로그인·인트로 건너뛰기·코드 입장·준비·역할 확인·채팅
// 고르개 규칙: 화면 글자·aria-label·role 먼저 (README '고르개 규칙'), 시험·game.js가 씀
const { expect } = require('@playwright/test');
const { E2E } = require('./env');

/** 로비 인트로 영상이 뜨면 건너뛰기 (안 뜨면 그냥 지나감) */
async function skipIntro(page, { timeoutMs = 3000 } = {}) {
    const skip = page.getByRole('button', { name: '인트로 건너뛰기' });
    try {
        await skip.waitFor({ state: 'visible', timeout: timeoutMs });
        await skip.click();
        await skip.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    } catch { /* 인트로 없음 */ }
}

/** 로그인 화면을 거쳐 로그인 → 로비 (데스크톱·모바일 같은 글자) */
async function loginViaUi(page, account, { remember = false } = {}) {
    await page.goto('/login');
    await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
    await page.getByPlaceholder('비밀번호를 입력하세요').fill(account.password);
    if (remember) await page.getByRole('checkbox', { name: '로그인 상태 유지' }).check();
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby$/);
}

/**
 * API로 로그인해 context에 쿠키만 넣음 (화면 안 거침, 빠름) — 그 뒤 page.goto('/lobby')
 * context.request는 브라우저와 쿠키를 같이 씀
 */
async function loginViaApi(context, account, { rememberMe = false } = {}) {
    for (let attempt = 1; ; attempt += 1) {
        const res = await context.request.post(`${E2E.apiUrl}/auth/login`, {
            data: { email: account.email, password: account.password, rememberMe },
            headers: { origin: E2E.desktopUrl },
        });
        if (res.ok()) return res.json();
        // 500은 새 계정 동시 첫 로그인 DB 교착 (README '알려진 문제') → 몇 번만 다시, 로그인 자체 시험은 loginViaUi를 씀
        if (res.status() < 500 || attempt >= 4) throw new Error(`API 로그인 실패 ${res.status()}`);
        console.warn(`[e2e] API 로그인 ${res.status()} → 다시 (${attempt})`);
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt + Math.random() * 200));
    }
}

/** 로비로 가서 인트로 건너뛰기 */
async function gotoLobby(page) {
    await page.goto('/lobby');
    await skipIntro(page);
    await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
}

/** 코드로 대기방 입장 (데스크톱: 6칸, 모바일: 한 칸) → 대기방 화면까지 */
async function joinRoomByCodeUi(page, roomCode) {
    await page.goto('/roomInvite');
    const first = page.getByRole('textbox', { name: /방 코드/ }).first();
    await first.click();
    await page.keyboard.type(roomCode);
    await page.getByRole('button', { name: '참여하기' }).click();
    await expect(page).toHaveURL(/\/game-matching/);
}

/** 대기방에서 준비완료 누르기 */
async function readyUi(page) {
    await page.getByRole('button', { name: '준비완료' }).click();
}

/** 역할 공개 창 → 내 역할 이름(예: '광대') 돌려줌, close면 확인 누름 */
async function readRoleReveal(page, { close = true } = {}) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    const texts = await dialog.getByRole('paragraph').allInnerTexts();
    if (close) await dialog.getByRole('button', { name: '확인' }).click();
    // [닉네임, 역할 이름, 설명]
    return texts[1] ?? null;
}

/** 단계 전환 안내 창(낮이 되었습니다 등) 떠 있으면 닫기 */
async function closePhaseNotice(page) {
    const dialog = page.getByRole('dialog', { name: '단계 전환 안내' });
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '확인' }).click().catch(() => {});
}

/** 인게임 채팅 보내기 */
async function sendChat(page, text) {
    const input = page.getByRole('textbox', { name: '채팅 입력' });
    await input.fill(text);
    await page.getByRole('button', { name: '채팅 보내기' }).click();
}

/** 채팅 내역에 글이 보일 때까지 */
async function expectChat(page, text) {
    await expect(page.getByRole('log', { name: '채팅 내역' })).toContainText(text);
}

/**
 * 화면이 window.alert로 알리는 문구 받기 (로그인 실패·가입 완료 등) — action을 돌리는 동안 뜬 첫 대화상자
 * @returns {Promise<string>} 문구
 */
async function captureAlert(page, action, { timeoutMs = 10000 } = {}) {
    const dialogPromise = page.waitForEvent('dialog', { timeout: timeoutMs });
    await action();
    const dialog = await dialogPromise;
    const message = dialog.message();
    await dialog.accept().catch(() => {});
    return message;
}

// 역할 이름 화면 글자
const ROLE_LABELS = Object.freeze({ JOKER: '광대', CITIZEN: '시민', DOCTOR: '의사', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' });

module.exports = {
    skipIntro, loginViaUi, loginViaApi, gotoLobby, joinRoomByCodeUi, readyUi, readRoleReveal, closePhaseNotice, sendChat, expectChat, captureAlert, ROLE_LABELS,
};
