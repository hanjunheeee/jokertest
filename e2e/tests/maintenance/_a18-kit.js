'use strict';

// A18(운영 규칙·점검·서버 끄기·모바일 광고) 브라우저 시험 몫 도우미 — 점검 줄 켜고 끄기(시작 시각 없이도)·큰 안내/띠 고르개·알림 모으기·서버 끄고 다시 켜기·가짜 광고 끼우기
// tests/maintenance/a18-*.spec.js·mobile/a18-*.spec.js만 씀 (이름이 .spec이 아니라 시험으로 안 셈, 공용 도우미는 안 고치고 불러만 씀)
const { expect } = require('@playwright/test');
const db = require('../../helpers/db');
const ui = require('../../helpers/ui');
const { internal, e2e } = require('../../helpers/internal');
const { triggerShutdown, waitBackendUp } = require('../../helpers/servers');
const { sleep } = require('../../helpers/wait');

const U = (x) => x.account?.uuid ?? x.uuid;
const nick = (x) => x.nickname ?? x.account.nickname;

// 화면·서버 글 (목록 A18 줄 그대로)
const TEXT = Object.freeze({
    MIN_PLAYERS: '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.',
    SHUTDOWN: '서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요.',
    SCHEDULED_TITLE: '점검 예정이에요',
    ACTIVE_TITLE: '지금 점검 중이에요',
    FORCE_END_LINE: '시각이 되면 진행 중 판이 강제로 끝나요.',
    FORCED_GAME_TITLE: '점검으로 판이 끝났어요',
    FORCED_GAME_DETAIL: '승패 없이 끝났어요. 보상과 벌점도 없어요.',
    FORCED_ROOM_TITLE: '점검으로 대기방이 닫혔어요',
    BANNED_NICKNAME: '사용할 수 없는 단어가 들어간 닉네임입니다.',
    EXIT_RESULT: '로비로 나가시겠습니까?',
});

// 판을 손잡이로만 넘기게 단계 시간을 가장 길게 (기다리는 동안 진짜 마감이 먼저 와서 흐름이 엇갈리는 것 막기)
const LONG_TIMES = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5, 늘려서 덮지 않음)
const SLACK_MS = 1500;

/** 그 시각까지 진짜로 기다림 (진짜 시간 규칙 확인에만) */
async function sleepUntil(at) {
    const wait = at - Date.now();
    if (wait > 0) await sleep(wait);
}

// ── 점검 (서버 전체에 걸려 @serial 시험만) ──

/**
 * 점검 줄만 고침 (다시 읽기 안 함 — 서버를 다시 켜서 켤 때 읽는지 보는 시험용)
 * startsInMs: null = 시작 시각 없음(바로 점검 중, 도는 판·대기방은 안 닫음 — 결정 아침 15번), 0 이하 = 이미 지남, 양수 = 예고
 * 시작 시각은 초 단위로 올림 (DB 시각 칸이 소수 초를 버려서 진짜 시간 확인이 어긋나지 않게)
 * @returns {{ startsAtMs: number|null }}
 */
async function writeMaint({ enabled, startsInMs = null, message = null }) {
    const startsAtMs = enabled && startsInMs !== null ? Math.ceil((Date.now() + startsInMs) / 1000) * 1000 : null;
    const endsAtMs = enabled ? Math.max(startsAtMs ?? Date.now(), Date.now()) + 3600e3 : null;
    await db.query(
        'UPDATE maintenance_state SET is_enabled = ?, message = ?, starts_at = ?, ends_at = ?, updated_at = NOW() WHERE id = 1',
        [enabled ? 1 : 0, enabled ? message : null, startsAtMs === null ? null : db.sqlTime(startsAtMs), endsAtMs === null ? null : db.sqlTime(endsAtMs)],
    );
    return { startsAtMs };
}

/** 점검 줄 고치고 Node마다 다시 읽기 (서버가 접속자에게 maintenance_notice 보냄) → { startsAtMs } */
async function setMaint(o) {
    const written = await writeMaint(o);
    await internal.reloadMaintenance();
    return written;
}

/** 점검 끄기 (finally에서 꼭 — 안 끄면 다른 시험 방 만들기가 막힘) */
const clearMaint = () => setMaint({ enabled: false });

// 점검 큰 안내 (PC는 창 자체, 휴대폰은 감싼 칸에 data-maintenance-notice) → 창 안 제목·단추로 봄
const noticeDialog = (page) => page.getByRole('alertdialog').filter({ has: page.locator('#maintenance-notice-title') });
const noticeTitle = (page) => page.locator('#maintenance-notice-title');
const noticeRemaining = (page) => page.locator('[data-maintenance-remaining]');
const noticeLine = (page, text) => noticeDialog(page).getByText(text, { exact: true });
const noticeButton = (page, name) => noticeDialog(page).getByRole('button', { name, exact: true });
// 위쪽 작은 띠 (PC: 글 + "자세히" 단추 / 휴대폰: 띠 전체가 단추)
const band = (page) => page.locator('[data-maintenance-band]');
const bandText = (page) => band(page).locator('span').first();

/** 큰 안내 단추 눌러 닫기 ("확인했어요" / 강제 종료면 "로비로 가기") */
async function closeNotice(page, name = '확인했어요') {
    await noticeButton(page, name).click();
    await expect(noticeDialog(page)).toHaveCount(0);
}

/** 띠 눌러 큰 안내 다시 열기 */
async function openBand(page) {
    const more = band(page).getByRole('button', { name: '자세히' });
    if (await more.count() > 0) await more.click();
    else await band(page).click();
}

/** 띠 글 남은 초 ("점검까지 29분 05초" → 1745), 모양이 다르면 null */
function bandSecondsOf(text) {
    const m = /^점검까지 (?:(\d+)시간 )?(?:(\d+)분 )?(\d+)초$/.exec((text ?? '').trim());
    if (!m) return null;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3]);
}

/** 화면이 바뀌어 점검 큰 안내가 다시 뜨면 닫음 (안 뜨면 그냥 지나감) → 닫았으면 참 */
async function dismissIfShown(page, { timeoutMs = 5000 } = {}) {
    try {
        await noticeDialog(page).waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
        return false;
    }
    await closeNotice(page, await noticeButton(page, '로비로 가기').count() > 0 ? '로비로 가기' : '확인했어요');
    return true;
}

// ── 알림·서버 끄기 ──

/** PC 브라우저 알림 창 글 모으기 (뜨자마자 확인), 모은 배열을 돌려줌 — 서버 끄기 안내·탈주 글이 떴는지 나중에 봄 */
function collectDialogs(page) {
    const got = [];
    page.on('dialog', (dialog) => { got.push(dialog.message()); dialog.accept().catch(() => {}); });
    return got;
}

/** 휴대폰 양피지 안내 창 (window.alert 대신 뜸) 글·닫기 */
const parchment = (page) => page.getByRole('alertdialog', { name: '안내' }).last();
const parchmentText = (page) => parchment(page).getByRole('paragraph').first();

/**
 * 시험 백엔드 끄기 → 다시 켜질 때까지 (다시 켜짐은 꼭 기다림 — 뒤 시험이 서버 없이 돌지 않게)
 * @serial·@shutdown 시험에서만
 */
async function restartBackend(o = {}) {
    try {
        await triggerShutdown(o);
    } finally {
        await waitBackendUp();
    }
}

/** 화면에서 "게임 만들기" 눌러 대기방까지 (점검 안내가 덮으면 닫고) → 서버 방 요약 */
async function createRoomOk(who) {
    const page = who.page;
    await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeVisible();
    await dismissIfShown(page, { timeoutMs: 1500 });
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(U(who)); return Boolean(room); }, { timeout: 15_000, message: '서버에 방 생김' }).toBe(true);
    return room;
}

/** 방 만들기 화면에서 "게임 만들기" → 뜬 알림 글 (점검 큰 안내가 덮으면 먼저 닫음), close:false면 휴대폰 안내 창을 안 닫음 */
async function createRoomAlert(page, o = {}) {
    await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeVisible();
    await dismissIfShown(page, { timeoutMs: 1500 });
    return ui.captureAlert(page, () => make.click(), o);
}

// ── 운영 규칙 (설정 칸) ──

const arrow = (page, label, side) => page.getByRole('button', { name: `${label} ${side}`, exact: true });

/** 칸 지금 숫자 (PC·모바일 둘 다: 화살표 단추의 부모 칸 글) — 예 '10' → 10 */
async function stepValue(page, label) {
    return parseInt((await arrow(page, label, '감소').locator('..').innerText()).trim(), 10);
}

/**
 * 화살표를 꺼질 때까지 누름 → 멈춘 값 (최대 20번, 넘으면 던짐)
 * @param {'감소'|'증가'} side
 */
async function pushToEnd(page, label, side) {
    const button = arrow(page, label, side);
    for (let i = 0; i < 20; i += 1) {
        if (!(await button.isEnabled())) return stepValue(page, label);
        const before = await stepValue(page, label);
        await button.click();
        await expect.poll(async () => (await button.isEnabled()) === false || (await stepValue(page, label)) !== before).toBe(true);
    }
    throw new Error(`${label} ${side} 단추가 20번 눌러도 안 꺼짐`);
}

// ── 모바일 광고 (진짜 광고 꾸러미·계정으로 요청이 안 나가게) ──

// 가짜 광고 값 (frontend-mobile/tests/a00-ads.mjs와 같은 값) — 광고 시험은 이 값으로 빌드한 모바일 화면이 있어야 "채워짐"까지 봄
const FAKE_AD = Object.freeze({ client: 'ca-pub-0000000000000000', banner: '1111111111', interstitial: '2222222222' });

// 광고 회사 주소 (진짜로 나가면 안 되는 곳)
const AD_HOST = /(^|\.)(googlesyndication\.com|doubleclick\.net|googleadservices\.com|googletagservices\.com|adtrafficquality\.google)$|^adservice\.google\./i;

// 가짜 AdSense 꾸러미: 광고 칸(ins)마다 "채워짐" 표시 + 흰 바탕 시험 광고 글 (진짜 광고 요청 없음)
const FAKE_ADSENSE_JS = `(() => {
  const fill = () => {
    for (const ins of document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])')) {
      ins.setAttribute('data-adsbygoogle-status', 'done');
      ins.setAttribute('data-ad-status', 'filled');
      const box = document.createElement('div');
      box.setAttribute('data-fake-ad', '');
      box.textContent = '시험 광고';
      box.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:50px;background:#ffffff;color:#111111;font:12px sans-serif';
      ins.appendChild(box);
    }
  };
  const queued = Array.isArray(window.adsbygoogle) ? window.adsbygoogle.length : 0;
  window.adsbygoogle = { loaded: true, push: () => fill() };
  for (let i = 0; i < queued; i += 1) fill();
})();`;

/**
 * 그 브라우저 context의 광고 요청 가로채기 — 화면을 열기 전에 꼭 부름
 * adsbygoogle.js → 가짜 꾸러미, 나머지 광고 주소 → 막음
 * @returns {{ scriptClients: string[], blocked: string[] }} 꾸러미를 부른 광고 계정·막은 주소 (시험이 봄)
 */
async function guardAds(context) {
    const seen = { scriptClients: [], blocked: [] };
    await context.route((url) => AD_HOST.test(url.hostname), async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === 'pagead2.googlesyndication.com' && url.pathname.endsWith('/adsbygoogle.js')) {
            seen.scriptClients.push(url.searchParams.get('client'));
            // 화면이 crossorigin="anonymous"로 부름 → 허용 머리글이 있어야 실행됨
            await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: FAKE_ADSENSE_JS });
            return;
        }
        seen.blocked.push(url.hostname);
        await route.abort();
    });
    return seen;
}

/**
 * 휴대폰 사람 하나: 새 계정·로그인 → 광고 가로채기 → 로비 (가로채기 전엔 아무 화면도 안 엶)
 * serial 프로젝트(PC 창)에서도 휴대폰 창으로 엶
 * @returns {Promise<{ account, context, page, ads }>}
 */
async function openPhone(players) {
    const phone = await players.add({ mobile: true, lobby: false });
    const ads = await guardAds(phone.context);
    await ui.gotoLobby(phone.page);
    return { ...phone, ads };
}

// 광고 고르개
const adDialog = (page) => page.locator('[data-interstitial-ad]');
const adClose = (page) => adDialog(page).getByRole('button', { name: '닫기', exact: true });
const adBanner = (page) => page.getByRole('complementary', { name: '광고' });
// 광고 칸 (진짜 자리 ins 또는 개발 회색 상자)
const adSlot = (scope) => scope.locator('ins.adsbygoogle, [data-ad-placeholder]');

/** 광고 칸이 가짜 광고 값으로 그려졌고 가짜 꾸러미가 "채움"까지 했는지 (빌드에 가짜 광고 값이 없으면 여기서 실패) */
async function expectFakeFilled(scope, ads) {
    const ins = scope.locator('ins.adsbygoogle');
    await expect(ins, '가짜 광고 값(VITE_AD_PROVIDER·VITE_ADSENSE_*)으로 빌드한 모바일 화면이어야 함').toHaveCount(1);
    await expect(ins).toHaveAttribute('data-ad-client', FAKE_AD.client);
    await expect(ins).toHaveAttribute('data-ad-status', 'filled');
    expect(ads.scriptClients.length, '가짜 꾸러미를 부름').toBeGreaterThan(0);
    expect(ads.scriptClients.every((c) => c === FAKE_AD.client), '진짜 광고 계정으로 부르지 않음').toBe(true);
}

/** 그 칸 가운데 점에서 맨 위 요소가 그 칸 안인지 (안 가려짐) */
function centerIsOwn(locator) {
    return locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return Boolean(hit && (el === hit || el.contains(hit)));
    });
}

/** 두 칸 상자가 겹치는지 */
const overlaps = (a, b) => Boolean(a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height);

module.exports = {
    U, nick, TEXT, LONG_TIMES, SLACK_MS, sleepUntil,
    writeMaint, setMaint, clearMaint, noticeDialog, noticeTitle, noticeRemaining, noticeLine, noticeButton, band, bandText,
    closeNotice, openBand, bandSecondsOf, dismissIfShown,
    collectDialogs, parchment, parchmentText, restartBackend, createRoomOk, createRoomAlert,
    arrow, stepValue, pushToEnd,
    FAKE_AD, guardAds, openPhone, adDialog, adClose, adBanner, adSlot, expectFakeFilled, centerIsOwn, overlaps,
};
