'use strict';

// 화면 공통 동작 파일, 데스크톱·모바일 둘 다 되는 고르개로 로그인·인트로 건너뛰기·코드 입장·준비·역할 확인·연출 창 닫기·채팅
// 고르개 규칙: 화면 글자·aria-label·role 먼저 (README '고르개 규칙'), 시험·game.js가 씀
const { expect } = require('@playwright/test');
const { E2E } = require('./env');
const { sleep } = require('./wait');

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
        await sleep(150 * attempt + Math.random() * 200);
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
    // 글 순서: [닉네임, 역할 이름, 진영, 설명, (동료 줄)] — 둘째 칸이 역할 이름, 닉네임 칸이 빠진 창이면 역할 이름인 칸을 찾음
    const roleNames = Object.values(ROLE_LABELS);
    if (roleNames.includes(texts[1]?.trim())) return texts[1];
    return texts.find((t) => roleNames.includes(t.trim())) ?? texts[1] ?? null;
}

/**
 * 모바일 결과 화면의 한 판 끝 광고 창 닫기 — 결과판이 나타나고 1.5초 뒤 뜨고 5초 지나야 "닫기"가 나옴
 * 광고 창은 결과판을 덮어 "대기방으로"·"로비로"를 못 누르게 함 → 모바일 결과 화면에서 단추를 누르기 전에 부름
 * PC엔 광고가 없고, 이미 닫았거나 안 뜨면 appearMs 뒤 그냥 지나감 (광고 자체를 보는 시험은 부르지 않음)
 * 광고 꾸러미를 못 받은 창은 "닫기" 전에 스스로 닫힘 → "닫기 누름"이나 "창 0개" 중 먼저 된 쪽으로 끝냄
 * @returns {Promise<boolean>} 떴다가 닫혔으면 true
 */
async function closeResultAd(page, { appearMs = 4000 } = {}) {
    const ad = page.locator('[data-interstitial-ad]');
    const shown = await ad.waitFor({ state: 'visible', timeout: appearMs }).then(() => true, () => false);
    if (!shown) return false;
    await expect(async () => {
        if ((await ad.count()) === 0) return;
        await ad.getByRole('button', { name: '닫기', exact: true }).click({ timeout: 1000 });
        await expect(ad).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    return true;
}

/** 단계 전환 안내 창(낮이 되었습니다 등) 떠 있으면 닫기 */
async function closePhaseNotice(page) {
    const dialog = page.getByRole('dialog', { name: '단계 전환 안내' });
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '확인' }).click().catch(() => {});
}

// 확인 버튼 하나로 닫히는 연출 창 이름 (단계 안내·밤 차례·알림·밤 결과·역할 보기)
const OVERLAY_DIALOGS = Object.freeze(['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과', '내 역할 보기']);

// 연출 창 한 바퀴 닫기, 하나라도 눌렀으면 참
async function closeOverlaysOnce(page, { keepWatching, names, clickTimeoutMs }) {
    let closed = false;
    // 낮 시작 암살 영상이 못 끝나 뜬 "건너뛰기": 12초 안에 안 끝나거나 자동 재생이 막혔을 때만 뜨는 단추 (잘 도는 영상엔 없어서 안 건드림)
    // 영상은 저절로 안 넘어가서 안 누르면 판 화면이 계속 덮인 채임 → names와 상관없이 누름
    const skipVideo = page.locator('[data-ingame-night-success-kill]').getByRole('button', { name: '건너뛰기', exact: true });
    if (await skipVideo.isVisible().catch(() => false)) {
        await skipVideo.click({ timeout: clickTimeoutMs }).catch(() => {});
        closed = true;
    }
    // 그 영상이 오류로 끝나면 같은 글이 글 창으로 바뀜(살해 KILLED 종류만) → "확인"을 눌러야 넘어감
    // 의사가 살렸을 때 글 창(SAVED)은 원래 연출이라 여기서 안 누름 (names에 '단계 전환 안내'가 있으면 아래에서 닫힘)
    const failedVideoConfirm = page.locator('[data-ingame-dawn-report="KILLED"]').getByRole('button', { name: '확인', exact: true });
    if (await failedVideoConfirm.isVisible().catch(() => false)) {
        await failedVideoConfirm.click({ timeout: clickTimeoutMs }).catch(() => {});
        closed = true;
    }
    for (const name of names) {
        const dialog = page.getByRole('dialog', { name, exact: true });
        if (!(await dialog.isVisible().catch(() => false))) continue;
        await dialog.getByRole('button', { name: '확인' }).click({ timeout: clickTimeoutMs }).catch(() => {});
        closed = true;
    }
    if (!keepWatching) return closed;
    const dead = page.getByRole('dialog', { name: '사망 후 선택' });
    if (!(await dead.isVisible().catch(() => false))) return closed;
    await dead.getByRole('button', { name: '관전 계속하기' }).click({ timeout: clickTimeoutMs }).catch(() => {});
    return true;
}

/**
 * 떠 있는 연출 창 닫기 (rounds 바퀴까지, 닫을 게 없으면 멈춤), keepWatching이면 사망 후 선택도 '관전 계속하기'
 * 하나 닫으면 밑에 깔린 창이 뜰 수 있어 여러 바퀴 — 모바일 _talk·인게임 c-chat 도우미가 씀
 * 못 끝난 암살 영상의 "건너뛰기"와 영상 오류 때 글 창 "확인"도 같이 넘김 (잘 도는 영상은 그대로 둠)
 */
async function closeOverlays(page, { keepWatching = true, rounds = 3, names = OVERLAY_DIALOGS, clickTimeoutMs = 3000, pauseMs = 0 } = {}) {
    for (let r = 0; r < rounds; r += 1) {
        if (!(await closeOverlaysOnce(page, { keepWatching, names, clickTimeoutMs }))) return;
        if (pauseMs > 0) await sleep(pauseMs);
    }
}

/** 채팅 내역 칸 (page 또는 그 안 영역) */
const chatLog = (scope) => scope.getByRole('log', { name: '채팅 내역' });

/** 인게임 채팅 보내기 */
async function sendChat(page, text) {
    const input = page.getByRole('textbox', { name: '채팅 입력' });
    await input.fill(text);
    await page.getByRole('button', { name: '채팅 보내기' }).click();
}

/** 채팅 내역에 글이 보일 때까지 */
async function expectChat(page, text) {
    await expect(chatLog(page)).toContainText(text);
}

/**
 * 화면이 window.alert로 알리는 문구 받기 (로그인 실패·가입 완료 등) — action을 돌리는 동안·뒤에 뜬 첫 알림
 * 데스크톱: 브라우저 대화상자를 뜨자마자 받아 닫음 (누르는 도중 떠도 click이 안 멈춤)
 * 모바일: window.alert를 양피지 안내 창(alertdialog "안내")으로 바꿔 둠 → 그 글을 읽고 "확인" 누름 (close:false면 안 닫음)
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<any>} action 알림을 띄울 동작 (누르기 등)
 * @param {{ timeoutMs?: number, close?: boolean }} [o]
 * @returns {Promise<string>} 문구
 */
async function captureAlert(page, action, { timeoutMs = 10000, close = true } = {}) {
    let onDialog = null;
    const native = new Promise((resolve) => {
        onDialog = (dialog) => {
            page.off('dialog', onDialog);
            const message = dialog.message();
            dialog.accept().catch(() => {}).finally(() => resolve(message));
        };
        page.on('dialog', onDialog);
    });
    const parchment = page.getByRole('alertdialog', { name: '안내' }).last();
    // 누르기 전부터 떠 있던 양피지 창은 이번 알림이 아님 → 그 글과 다른 글이 뜰 때까지
    const staleText = await parchment.isVisible().catch(() => false) ? await parchment.getByRole('paragraph').first().innerText().catch(() => null) : null;
    let timer = null;
    let settled = false;
    try {
        await action();
        const deadline = Date.now() + timeoutMs;
        const fromParchment = (async () => {
            while (!settled && Date.now() < deadline) {
                await parchment.waitFor({ state: 'visible', timeout: Math.max(1, deadline - Date.now()) });
                if (settled) return null;
                const text = await parchment.getByRole('paragraph').first().innerText().catch(() => '');
                if (staleText === null || text !== staleText) {
                    if (close) await parchment.getByRole('button', { name: '확인' }).click().catch(() => {});
                    return text;
                }
                await sleep(100);
            }
            throw new Error('양피지 안내 창 안 뜸');
        })();
        fromParchment.catch(() => {}); // 대화상자가 먼저 오면 이쪽 기다림은 버림
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`알림이 안 뜸 (${timeoutMs}ms)`)), timeoutMs); });
        return await Promise.race([native, fromParchment, timeout]);
    } finally {
        settled = true;
        clearTimeout(timer);
        page.off('dialog', onDialog);
    }
}

// 역할 이름 화면 글자 (시민 직업 화면 이름은 "귀족", 결정 2026-11-16 셋째 8번 — 진영 이름 "시민 진영"은 그대로)
const ROLE_LABELS = Object.freeze({ JOKER: '광대', CITIZEN: '귀족', DOCTOR: '의사', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' });

module.exports = {
    skipIntro, loginViaUi, loginViaApi, gotoLobby, joinRoomByCodeUi, readyUi, readRoleReveal, closeResultAd, closePhaseNotice,
    OVERLAY_DIALOGS, closeOverlays, chatLog, sendChat, expectChat, captureAlert, ROLE_LABELS,
};
