'use strict';

// A14 관리자 브라우저 시험 같이 쓰는 도우미 파일, 관리자 창 열기·관리자 API·플레이어 창·신고·문의 넣기·관리자 화면 고르개·한국 시각 글자
// tests/admin/a14-*.spec.js·admin/phone/a14-*·multinode/a14-* 가 씀 (이름이 _로 시작해 시험으로 안 돎)
const crypto = require('node:crypto');
const { devices, expect } = require('@playwright/test');
const { E2E } = require('../../helpers/env');
const admins = require('../../helpers/adminAccounts');
const { allowAccess } = require('../../helpers/adminAccess');
const { query } = require('../../helpers/db');
const { openPerson } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');

// 목록 번호 (예: E(1) → 'A14-E-001', H(3) → 'A14-H-003')
const E = (no) => `A14-E-${String(no).padStart(3, '0')}`;
const H = (no) => `A14-H-${String(no).padStart(3, '0')}`;

const U = (x) => x.account?.uuid ?? x.uuid;
const NICK = (x) => x.account?.nickname ?? x.nickname;
const rand = (n = 3) => crypto.randomBytes(n).toString('hex');

// 관리자 창 크기: PC 1280×800 / 휴대폰 375×812 터치 (playwright.config admin·admin-phone과 같은 값)
const PC_VIEW = Object.freeze({ viewport: { width: 1280, height: 800 } });
const PHONE_VIEW = Object.freeze({ ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

// 화면 글 (frontend/src/admin 화면 파일에서 그대로 옮김)
const TEXT = Object.freeze({
    loginFailed: '아이디, 비밀번호, OTP 번호 중 맞지 않는 것이 있어요. 다시 확인해 주세요.',
    emailMismatch: '관리자 메일 확인에 쓴 메일과 이 계정의 메일이 달라요. 본인 계정으로 로그인해 주세요.',
    sessionExpired: '오래 쓰지 않아 로그아웃됐어요. 다시 로그인해 주세요.',
    locked: /여러 번 틀려서 로그인이 잠겼어요\. 15분 뒤 다시 해 주세요\./,
    noAccess: '접근 권한 없음',
    rangeError: '0부터 100까지 정수로 넣어 주세요.',
    // 플레이어 쪽 (backend services/ops/disconnect.js·services/auth/sessionLifecycle.js)
    bannedPush: '정지된 계정입니다.',
    kickedPush: '운영자에 의해 연결이 종료되었습니다.',
    bannedLogin: (reason) => `정지된 계정입니다. 사유: ${reason}`,
});

// ── 한국 시각 글자 (관리자 화면은 늘 한국 시각, 초 없음) ──

const KST_MS = 9 * 60 * 60 * 1000;
const pad = (v) => String(v).padStart(2, '0');
const kstParts = (ms) => {
    const d = new Date(ms + KST_MS);
    return { y: d.getUTCFullYear(), mo: pad(d.getUTCMonth() + 1), d: pad(d.getUTCDate()), h: pad(d.getUTCHours()), mi: pad(d.getUTCMinutes()) };
};
/** 예: kstText(Date.UTC(2026,10,15,14,59)) → '2026-11-15 23:59' */
const kstText = (ms) => { const p = kstParts(ms); return `${p.y}-${p.mo}-${p.d} ${p.h}:${p.mi}`; };
/** 시각 칸 값 (datetime-local), 예: '2026-11-15T23:59' */
const kstInput = (ms) => { const p = kstParts(ms); return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`; };
/** 날짜 칸 값 (date), 예: '2026-11-15' */
const kstDay = (ms) => { const p = kstParts(ms); return `${p.y}-${p.mo}-${p.d}`; };

// ── 관리자 창 ──

/**
 * 관리자 창 하나 (관리자 주소, PC 또는 휴대폰 크기) — 로그인은 안 함
 * @serial 시험은 기본 주소가 게임 화면인 serial 프로젝트에서 돌아서 늘 이 창을 새로 엶
 */
async function openAdminWindow(browser, { phone = false, account } = {}) {
    const context = await browser.newContext({ ...(phone ? PHONE_VIEW : PC_VIEW), baseURL: E2E.adminUrl, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    const admin = account ?? await admins.createAdmin();
    return { context, page, admin, close: () => context.close().catch(() => {}) };
}

/** 관리자 창 + 화면으로 로그인 (Access 쿠키 → 아이디·비번·OTP) → { context, page, admin, close } */
async function openAdmin(browser, o = {}) {
    const w = await openAdminWindow(browser, o);
    await admins.loginAsAdmin(w.page, w.admin);
    return w;
}

/** 로그인한 관리자 창 쿠키로 관리자 API → { status, body } (쓰기 확인 값은 /auth/me에서) */
async function adminCall(adminPage, method, pathname, data) {
    const request = adminPage.context().request;
    const me = await request.get(`${E2E.adminUrl}/admin-api/auth/me`);
    expect(me.ok(), `관리자 세션 확인 (${me.status()})`).toBe(true);
    const { csrfToken } = await me.json();
    const res = await request.fetch(`${E2E.adminUrl}/admin-api${pathname}`, {
        method, data, headers: { origin: E2E.adminUrl, 'x-admin-csrf': csrfToken },
    });
    let body = null;
    try { body = await res.json(); } catch { /* 몸 없음 */ }
    return { status: res.status(), body };
}

/** 관리자 API, 성공이어야 함 → 답 몸 (준비·되돌리기용 — 시험하려는 동작은 화면으로 누름) */
async function adminApi(adminPage, method, pathname, data) {
    const r = await adminCall(adminPage, method, pathname, data);
    expect(r.status < 300, `${method} ${pathname} → ${r.status} ${JSON.stringify(r.body)}`).toBe(true);
    return r.body;
}

/** 메뉴로 그 화면 가기 (휴대폰은 "메뉴 열기" 서랍 먼저) */
async function goMenu(page, label) {
    const opener = page.getByRole('button', { name: '메뉴 열기' });
    if (await opener.isVisible().catch(() => false)) await opener.click();
    await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: label, exact: true }).click();
}

/** 화면 제목 (h1) */
const heading = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });

/** 회원 상세 열기 (제목 = 닉네임) */
async function openMember(adminPage, member) {
    await adminPage.goto(`/members/${U(member)}`);
    await expect(heading(adminPage, NICK(member))).toBeVisible();
}

/** 확인 창 (제목으로) */
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });

/** DataList 목록 (넓은 화면 = 표 줄, 휴대폰 = 카드) — caption 이름으로 */
function listRows(page, caption) {
    const table = page.getByRole('table', { name: caption, exact: true });
    const cards = page.getByRole('list', { name: caption, exact: true }).getByRole('listitem');
    return table.locator('tbody tr').or(cards);
}

/**
 * 회원 상세에서 정지 (확인 창까지 화면으로)
 * @param {{ kind?: 'PERIOD'|'PERMANENT', days?: number, reason?: string }} o
 */
async function banUi(adminPage, member, { kind = 'PERIOD', days = 1, reason = '시험 정지 사유' } = {}) {
    await openMember(adminPage, member);
    const title = kind === 'PERMANENT' ? '영구 정지' : '기간 정지';
    await adminPage.getByRole('region', { name: '제재' }).getByRole('button', { name: title, exact: true }).click();
    const box = dialog(adminPage, title);
    await expect(box).toBeVisible();
    if (kind === 'PERIOD') await box.getByLabel('정지 일수').fill(String(days));
    await box.getByLabel(/^정지 사유/).fill(reason);
    return box;
}

/** banUi 뒤 "정지하기" 누르고 창이 닫힐 때까지 */
async function confirmBan(adminPage, box) {
    await box.getByRole('button', { name: '정지하기' }).click();
    await expect(box).toBeHidden();
    await expect(adminPage.getByRole('region', { name: '제재' }).getByRole('status')).toContainText('정지했어요.');
}

/** 회원 상세에서 사유만 받는 창 열기 (강제 접속 종료·제재 해제) → 창 */
async function reasonDialog(adminPage, member, buttonName, title, reason) {
    await openMember(adminPage, member);
    await adminPage.getByRole('region', { name: '제재' }).getByRole('button', { name: buttonName, exact: true }).click();
    const box = dialog(adminPage, title);
    await expect(box).toBeVisible();
    await box.getByRole('textbox').fill(reason);
    return box;
}

/** 처리 이력 화면 → 칸 고르고 "누가"를 그 관리자로 거름 → 줄 목록 */
async function auditRows(adminPage, admin, { kind = '전체' } = {}) {
    await goMenu(adminPage, '처리 이력');
    await expect(heading(adminPage, '처리 이력')).toBeVisible();
    await adminPage.getByRole('group', { name: '이력 칸' }).getByRole('button', { name: kind, exact: true }).click();
    // "누가" 목록은 관리자 200명까지라 시험 관리자가 많으면 없을 수 있음 → 있으면 고르고, 줄은 늘 아이디로 한 번 더 거름
    const who = adminPage.getByLabel('누가', { exact: true });
    await expect.poll(() => who.locator('option').count(), { timeout: 5000, message: '관리자 목록' }).toBeGreaterThan(1).catch(() => {});
    if (await who.locator('option', { hasText: admin.loginId }).count() > 0) await who.selectOption({ label: admin.loginId });
    return listRows(adminPage, '처리 이력').filter({ hasText: admin.loginId });
}

/** 판 골드 값 (game_settings GAME_GOLD_REWARD) */
const goldSetting = async () => Number((await query("SELECT value_int FROM game_settings WHERE `key` = 'GAME_GOLD_REWARD'"))[0]?.value_int);

/** 점검 끄기 (관리자 API) — 점검 시험 finally에서 꼭 부름 (안 끄면 다른 시험 방 만들기가 막힘) */
const maintenanceOff = (adminPage) => adminApi(adminPage, 'PUT', '/maintenance', { enabled: false, message: null, startsAt: null, endsAt: null });

// ── 플레이어 ──

/** 플레이어 PC 창 (관리자 묶음은 기본 주소가 관리자라 따로 엶) → { account, context, page } (로비) */
const openPlayer = (players, o = {}) => players.add({ mobile: false, ...o });

/** 플레이어 쿠키로 게임 서버 HTTP → { status, body } */
async function playerCall(person, method, pathname, data) {
    const res = await person.context.request.fetch(`${E2E.apiUrl}${pathname}`, { method, data, headers: { origin: E2E.desktopUrl } });
    let body = null;
    try { body = await res.json(); } catch { /* 몸 없음 */ }
    return { status: res.status(), body };
}

/** 판 안에서 신고 (플레이어 API) → 신고 id */
async function reportInGame(person, { target, gameId, reasonCode = 'ABUSE', memo = '시험 신고' }) {
    const r = await playerCall(person, 'POST', '/reports', { targetUuid: U(target), gameId, reasonCode, memo });
    expect(r.status, `신고 접수 ${JSON.stringify(r.body)}`).toBe(201);
    return Number(r.body.reportId);
}

/** 증거 없는 신고 줄 바로 넣기 (판 없이, 게임 신고 접수와 같은 모양) → 신고 id */
async function insertReport({ reporter, target }) {
    const gameId = crypto.randomUUID();
    await query(
        "INSERT INTO reports (reporter_id, target_id, game_id, reason_code, memo, status, created_at) VALUES (?, ?, ?, 'ABUSE', '시험 신고', 'OPEN', NOW())",
        [U(reporter), U(target), gameId],
    );
    const [{ id }] = await query('SELECT id FROM reports WHERE reporter_id = ? AND game_id = ?', [U(reporter), gameId]);
    return Number(id);
}

/** 문의 쓰기 (플레이어 API) → { id, title } */
async function createInquiry(person, { title = `시험 문의 ${rand()}`, body = '시험 문의 내용' } = {}) {
    const r = await playerCall(person, 'POST', '/inquiries', { category: 'BUG', title, body });
    expect(r.status < 300, `문의 쓰기 ${r.status} ${JSON.stringify(r.body)}`).toBe(true);
    return { id: Number(r.body.inquiry.id), title };
}

/** 플레이어 로그인 화면 거쳐 로그인 시도 → 뜬 알림 글 (정지면 거절 글) */
async function loginAlert(page, account) {
    if (!/\/login/.test(page.url())) await page.goto('/login');
    await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
    await page.getByPlaceholder('비밀번호를 입력하세요').fill(account.password);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
}

/** 플레이어 로그인 화면 거쳐 로그인 → 로비가 아니어도 됨 (판 중이면 판 화면으로 감) */
async function loginUi(page, account) {
    if (!/\/login/.test(page.url())) await page.goto('/login');
    await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
    await page.getByPlaceholder('비밀번호를 입력하세요').fill(account.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

/**
 * 소켓 글을 다 적어 두는 플레이어 창 (판 화면엔 알림 종이 없어 받은 알림을 소켓 글로 봄)
 * 소켓이 생기기 전에 적기를 걸어야 해서 로그인 전에 창을 엶 → { account, context, page, frames, close }
 */
async function openWatchedPlayer(browser, { account } = {}) {
    const p = await openPerson(browser, { mobile: false, account, login: false });
    const frames = [];
    p.page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await ui.loginViaApi(p.context, p.account);
    await ui.gotoLobby(p.page);
    return { ...p, frames, close: () => p.context.close().catch(() => {}) };
}

/** 로비 알림 창 열기 → 창 */
async function openBell(page) {
    await page.getByRole('button', { name: /^알림/ }).click();
    const box = page.getByRole('dialog', { name: '알림' });
    await expect(box).toBeVisible();
    return box;
}

/** 알림 창에서 글이 든 알림 줄 */
const bellItems = (box, text) => box.locator('li[data-notification-id]').filter({ hasText: text });

/** 겹치지 않는 닉네임: 무작위 한글 두 글자 + 16진 4자 (앞 두 글자로 찾으면 이 회원만 나옴) */
function uniqueNickname() {
    const syllable = () => String.fromCharCode(0xac00 + crypto.randomInt(11172));
    return `${syllable()}${syllable()}${rand(2)}`;
}

/** 관리자 목록 이메일 가림 모양 (결정 2026-11-16 아침 20번: 지금대로) — 예: 'abc@example.com' → 'a***c@e***.com' */
function maskedEmail(email) {
    const [local, domain] = email.split('@');
    const dot = domain.lastIndexOf('.');
    return `${local[0]}***${local[local.length - 1]}@${domain[0]}***${domain.slice(dot)}`;
}

/** 가로 넘침 없음 (휴대폰 화면) */
async function expectNoSideScroll(page) {
    const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
    expect(scroll, `가로 넘침 (내용 ${scroll}px > 화면 ${width}px)`).toBeLessThanOrEqual(width);
}

module.exports = {
    E, H, U, NICK, rand, TEXT, PC_VIEW, PHONE_VIEW, kstText, kstInput, kstDay,
    openAdminWindow, openAdmin, adminCall, adminApi, goMenu, heading, openMember, dialog, listRows,
    banUi, confirmBan, reasonDialog, auditRows, goldSetting, maintenanceOff,
    openPlayer, playerCall, reportInGame, insertReport, createInquiry, loginAlert, loginUi, openWatchedPlayer,
    openBell, bellItems, uniqueNickname, maskedEmail, expectNoSideScroll, allowAccess, admins,
};
