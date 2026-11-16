'use strict';

// 끊김·나가기·탈주 어려운 브라우저 시험(사람 여럿)이 같이 쓰는 도우미 — 사람 열기·판 앉히기(직업 전원 고정)·화면 소켓 끊고 잇기·카드 상태 기록·여러 사람 투표·탈주 줄·관리자 창
// tests/**/a09-*-multi·a09-*-real·a09-mixed-devices·a09-deserter-return·a09-result-refresh·a09-desertion-invite.spec.js(목록 A09-H-001~060)만 씀, 공용 도우미는 불러만 씀
const { expect } = require('@playwright/test');
const { E2E } = require('../../helpers/env');
const ui = require('../../helpers/ui');
const { query } = require('../../helpers/db');
const admins = require('../../helpers/adminAccounts');
const K = require('./_a09-simple-kit');
const A = require('./_a04-multi');
const night = require('./b-night/_night');

const U = (who) => who.account.uuid;
const nick = (who) => who.nickname ?? who.account.nickname;
// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5, 늘려서 덮지 않음)
const TOL = 1500;
const GRACE_MS = 60_000;
// 화면 소켓이 다시 붙는 간격이 최대 7.5초쯤(socket.io 기본 5초 ± 절반) → 59초 안에 돌아오려면 50초에 길을 엶
const REOPEN_AT_MS = 50_000;
// 단계가 저절로 안 넘어가게 서버가 받는 가장 긴 시간 (단계는 손잡이로 넘김, 시간 규칙을 보는 시험만 덮어씀)
const ROOMY = A.ROOMY_TIMES;
// 목록이 적은 짧은 시간 (토론 30·투표 30·재판 15·밤 30)
const FAST = Object.freeze({ dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 });

// 받은 판 화면 글 (화면 코드에서 확인)
const TEXT = Object.freeze({
    saved: '지난밤 의사가 공격받은 사람을 살려냈습니다',
    citizenWin: '시민 진영 승리',
    jokerWin: '광대 진영 승리',
    startBlocked: '일부 참가자와의 연결을 확인할 수 없습니다',
    resultGone: '게임 결과를 확인할 수 없습니다',
    disconnectedNotice: (name) => `${name}님의 연결이 끊겼습니다`,
});
const ROLE_WORDS = Object.values(ui.ROLE_LABELS);

/**
 * 사람 여럿 열기: 첫 사람은 기본 user, 나머지는 새 계정·새 창 (mobile에 적은 번째는 모바일 창)
 * @returns {Promise<Array<{account:object,page:any,context:any}>>} [ㄱ, ㄴ, ㄷ, …]
 */
async function openPeople(user, players, count, { mobile = [] } = {}) {
    const list = [user];
    for (let i = 1; i < count; i += 1) list.push(await players.add({ mobile: mobile.includes(i) ? true : undefined }));
    return list;
}

// 자동 역할 구성 (광대 수만 정하고 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼, 남는 자리 시민)
function compositionOf(n, settings = {}) {
    const list = [];
    if (settings.roleCompositionMode === 'custom') {
        for (const [role, k] of Object.entries(settings.roleCounts ?? {})) for (let i = 0; i < k; i += 1) list.push(role);
    } else {
        for (let i = 0; i < (settings.jokerCount ?? 1); i += 1) list.push('JOKER');
        if (n >= 6) list.push('DOCTOR');
        if (n >= 8) list.push('GUARD');
        if (n >= 10) list.push('WITCH_HUNTER');
    }
    while (list.length < n) list.push('CITIZEN');
    return list;
}

// 봇 직업 차례: 시민 먼저·광대 마지막 (봇 0번이 늘 시민이라 봇 하나 처형으로 판이 안 끝남)
const BOT_ORDER = ['CITIZEN', 'WITCH_HUNTER', 'GUARD', 'DOCTOR', 'JOKER'];

/** 직업 계획: 사람은 humanRoles(기본 시민), 봇은 botRoles 먼저 그다음 남은 직업 → ({ humans, bots }) => { uuid: 직업 } */
function rolePlan(n, { humanRoles = [], botRoles = [], settings = {} } = {}) {
    return ({ humans, bots }) => {
        const pool = compositionOf(n, settings);
        const take = (role) => {
            const i = pool.indexOf(role);
            if (i < 0) throw new Error(`${n}명 구성에 ${role} 자리 없음 (구성 확인)`);
            pool.splice(i, 1);
            return role;
        };
        const out = {};
        humans.forEach((h, i) => { out[U(h)] = take(humanRoles[i] ?? 'CITIZEN'); });
        const fixed = botRoles.map(take);
        pool.sort((a, b) => BOT_ORDER.indexOf(a) - BOT_ORDER.indexOf(b));
        const order = [...fixed, ...pool];
        bots.forEach((b, i) => { out[U(b)] = order[i]; });
        return out;
    };
}

/**
 * 판 앉히기: 사람 여럿 + 봇(n - 사람 수), 직업은 전원 정해 주고 서버 값과 같은지 확인, 사람 화면 역할 확인 창 닫기
 * PC 사람은 남은 시간 자리를 시간 바로 고정해 둠 (펼친 시간 바에서 단계 글·남은 초를 읽음)
 * @param {object} o
 * @param {number} o.n 판 인원 (5~10)
 * @param {string[]} [o.humanRoles] 사람 순서대로 직업
 * @param {string[]} [o.botRoles] 봇 앞에서부터 직업 (나머지는 시민 먼저)
 * @param {object} [o.times] 단계 시간 (기본 가장 긴 값)
 */
async function seat(table, humans, { n, humanRoles = [], botRoles = [], settings = {}, times = ROOMY, reveal = true } = {}) {
    for (const h of humans) if (!A.isMobile(h.page)) await K.pinTimebar(h.page);
    const plan = rolePlan(n, { humanRoles, botRoles, settings });
    const t = await table.setup({ humans, bots: n - humans.length, settings: { ...times, ...settings }, roles: plan });
    const want = plan({ humans, bots: t.bots });
    const s = await t.state();
    expect(s.players.length, '판 인원').toBe(n);
    expect(Object.fromEntries(s.players.map((p) => [p.uuid, p.role])), '정한 직업이 서버에 그대로').toEqual(want);
    if (reveal) await Promise.all(humans.map((h) => ui.readRoleReveal(h.page)));
    return t;
}

/** 그 직업 봇들 (판 요약 기준, 앉힐 때 정한 차례 그대로) */
async function botsBy(t, role) {
    const s = await t.state();
    return t.bots.filter((b) => K.roleOf(s, U(b)) === role);
}

/**
 * 화면 소켓 길목 (그 사람 브라우저 창 전부, 판에 들어가기 전에 걸어야 그 뒤 소켓이 이 길로 감)
 * cut()  열린 소켓을 닫고 새 접속도 거절 → 서버는 바로 끊김을 앎 (= 그 사람이 오프라인)
 * open() 다시 붙게 풂 → 화면 소켓이 스스로 다시 붙음 (= 온라인)
 */
async function socketGate(person) {
    const gate = { offline: false, opened: 0, refused: 0, pairs: [] };
    await person.context.routeWebSocket(/\/socket\.io\//, (ws) => {
        if (gate.offline) {
            gate.refused += 1;
            ws.close();
            return;
        }
        const server = ws.connectToServer();
        gate.opened += 1;
        gate.pairs.push({ ws, server });
    });
    gate.cut = async () => {
        gate.offline = true;
        for (const { ws, server } of gate.pairs.splice(0)) {
            await Promise.resolve(server.close()).catch(() => {});
            await Promise.resolve(ws.close()).catch(() => {});
        }
    };
    gate.open = () => { gate.offline = false; };
    return gate;
}

/** 오프라인: 소켓 끊고 서버가 끊김을 알린 때(ms)까지 → 서버의 60초는 이때부터 셈 */
async function goOffline(t, person, gate) {
    const since = Date.now();
    await gate.cut();
    return K.droppedAt(t, U(person), since, { timeoutMs: 20_000 });
}

/** 온라인: at(ms)까지 진짜로 기다린 뒤 길을 열고 서버가 돌아옴을 알린 때(ms)까지 */
async function goOnline(t, person, gate, { at = 0 } = {}) {
    await K.sleepUntil(at);
    const since = Date.now();
    gate.open();
    return K.returnedAt(t, U(person), since, { timeoutMs: 20_000 });
}

/** 판 카드 상태가 될 때까지 (alive·dead·disconnected) */
const expectStatus = (page, nickname, status, timeout = 15_000) => expect(K.cardOf(page, nickname))
    .toHaveAttribute('data-ingame-player-status', status, { timeout });

/** 판 카드 상태가 그 값이 된 시각(ms) — 화면 안에서 프레임마다 봐서 늦지 않음 */
async function statusAt(page, nickname, status, { timeout = 20_000 } = {}) {
    await page.waitForFunction(([name, want]) => {
        const el = [...document.querySelectorAll('[data-ingame-player-nickname]')].find((e) => e.getAttribute('data-ingame-player-nickname') === name);
        return el?.getAttribute('data-ingame-player-status') === want;
    }, [nickname, status], { timeout, polling: 'raf' });
    return Date.now();
}

/** 그 카드 상태가 바뀔 때마다 적어 둠 (잠깐 스친 상태도 잡음) — 판 화면에 들어온 뒤 부름, 새로고침하면 지워짐 */
async function watchStatus(page, nickname) {
    await page.evaluate((name) => {
        window.__a09Status = window.__a09Status ?? {};
        const log = [];
        window.__a09Status[name] = log;
        let last;
        const scan = () => {
            const el = [...document.querySelectorAll('[data-ingame-player-nickname]')].find((e) => e.getAttribute('data-ingame-player-nickname') === name);
            const now = el ? el.getAttribute('data-ingame-player-status') : null;
            if (now !== last) { log.push(now); last = now; }
        };
        new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ingame-player-status'] });
        scan();
    }, nickname);
}

/** 적어 둔 상태 차례 (카드가 잠깐 없던 때·같은 값 되풀이는 뺌) → 예: ['alive', 'disconnected', 'alive'] */
async function statusSeen(page, nickname) {
    const raw = await page.evaluate((name) => window.__a09Status?.[name] ?? [], nickname);
    return raw.filter(Boolean).filter((v, i, list) => i === 0 || v !== list[i - 1]);
}

/** 봇이 그 사건을 받은 때(ms)와 값 (since 뒤 것만) → { payload, at } */
async function eventAt(bot, event, { since = 0, match = () => true, timeoutMs = 20_000 } = {}) {
    const payload = await bot.waitForEvent(event, { since, match, timeoutMs });
    const row = bot.events.find((r) => r.event === event && r.at >= since && r.payload === payload);
    return { payload, at: row?.at ?? Date.now() };
}

/** 판 화면 새로고침 → 판 화면 그대로, 카드가 n장 다 그려질 때까지 */
async function reloadIngame(page, n) {
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/);
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(n, { timeout: 30_000 });
}

/** 카드 글에 직업 이름이 없음 (끊겨 빠진 사람 직업 비공개) */
async function expectNoRoleOnCard(page, nickname) {
    const text = await K.cardOf(page, nickname).innerText();
    for (const word of ROLE_WORDS) expect(text, `카드 글에 "${word}"`).not.toContain(word);
}

/** 브라우저 알림·확인 창 글 모으기 (뜨면 바로 확인) → 글 배열 (PC 화면만) */
function collectDialogs(page) {
    const messages = [];
    page.on('dialog', (dialog) => { messages.push(dialog.message()); dialog.accept().catch(() => {}); });
    return messages;
}

/** 60초 못 돌아와 빠진 사람 화면: 까닭 글 + 방 목록 (PC는 알림 창 글, 모바일은 양피지 안내 창) */
async function expectForfeited(page, messages = null) {
    if (A.isMobile(page)) {
        await expect(page.getByRole('alertdialog', { name: '안내' }).last()).toContainText(K.FORFEIT_TEXT, { timeout: 30_000 });
    } else {
        await expect.poll(() => messages.includes(K.FORFEIT_TEXT), { timeout: 30_000, message: '까닭 글 알림' }).toBe(true);
    }
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 30_000 });
}

/** 서버가 정한 지금 단계 마감 시각(ms) — 붙어 있는 봇 스냅샷에서 (낮·재판·밤 차례) */
async function deadlineOf(t, bot = t.bots.find(K.isUp)) {
    const snap = await bot.snapshot(t.gameId);
    const at = snap?.dayPhaseDeadline ?? snap?.tribunalDeadline ?? snap?.nightTurnDeadline;
    if (!Number.isFinite(at)) throw new Error(`마감 시각을 못 읽음 (단계 ${snap?.phase})`);
    return at;
}

// 펼친 시간 바 단계 글 ("[낮-토론과 투표]"·"[밤-의사]" 같은 모양)
const phaseLabel = (page) => K.timebar(page).getByText(/^\[.+-.+\]$/).first();

/** PC: 시간 바를 펼쳐 단계 글과 남은 초 읽기 → { label, seconds } */
async function readClock(page, { locked = false } = {}) {
    await K.expandBar(page, { locked });
    await expect(phaseLabel(page)).toBeVisible({ timeout: 15_000 });
    return { label: await phaseLabel(page).innerText(), seconds: await K.barSeconds(page) };
}

/** PC: "내 역할 보기"로 역할 창을 다시 열어 내 직업 이름이 읽히는지 */
async function expectMyRole(page, roleLabel) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    await expect(async () => {
        await ui.closeOverlays(page, { names: ['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과'], keepWatching: false });
        if (!(await dialog.isVisible())) await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 25_000 });
    await expect(dialog.getByText(roleLabel, { exact: true }).first()).toBeVisible();
    await dialog.getByRole('button', { name: '확인' }).click().catch(() => {});
}

/** 그 날 낮 투표까지 (손잡이), pages는 기권 단추가 보일 때까지 안내 창을 닫아 줌 */
async function toVote(t, pages = [], dayIndex = 1) {
    const s = await A.toVote(t, dayIndex, { screens: false });
    for (const page of pages) {
        await A.calm(page, () => expect(page.getByRole('button', { name: '기권' }).first()).toBeVisible({ timeout: 1000 }));
    }
    return s;
}

/**
 * 피고 세우기: 붙어 있는 산 봇(피고·skipBots 빼고)이 찍고, voters(사람)도 화면으로 찍은 뒤 투표 마감(손잡이)
 * → 낮을 벗어난 판 요약 (재판이 열렸는지는 부른 쪽이 봄)
 */
async function pickDefendant(t, defendantUuid, { voters = [], skipBots = [] } = {}) {
    let s0 = await t.state();
    // 아직 투표 단계가 아니면 다음 낮 투표까지 (밤의 날짜 숫자는 그 날 그대로라 다음 낮은 +1)
    if (!(s0.phase === 'DAY' && s0.dayPhase === 'DAY_VOTE')) {
        const day = s0.phase === 'DAY' ? s0.dayIndex : s0.phase === 'ROLE_REVEAL' ? 1 : s0.dayIndex + 1;
        s0 = await toVote(t, voters.map((h) => h.page), day);
    }
    const skip = new Set(skipBots.map(U));
    const bots = t.bots.filter((b) => K.isUp(b) && !skip.has(U(b)) && U(b) !== defendantUuid && K.rowOf(s0, U(b))?.alive === true);
    await A.botsDayVote(t, defendantUuid, bots);
    const name = K.rowOf(s0, defendantUuid).nickname;
    for (const h of voters) await A.dayVoteUi(h.page, name);
    await t.advance();
    return A.waitState(t, (g) => g.phase !== 'DAY', { message: '낮 판정 기다림' });
}

/** 붙어 있는 산 봇들 재판 표 (피고 빼고) */
async function botsJudge(t, vote) {
    const s = await t.state();
    const bots = t.bots.filter((b) => K.isUp(b) && K.rowOf(s, U(b))?.alive === true && s.tribunal?.defendantUuid !== U(b));
    await A.botsTribunal(t, vote, bots);
    return bots;
}

/** 봇·사람 표로 그 사람 처형 → 죽은 뒤 판 요약 (재판 마감은 손잡이) */
async function execute(t, targetUuid, { voters = [] } = {}) {
    const s = await pickDefendant(t, targetUuid, { voters });
    if (s.phase !== 'TRIBUNAL') throw new Error(`재판이 안 열림: ${s.phase}`);
    await botsJudge(t, 'GUILTY');
    await t.advance();
    return A.waitState(t, (g) => K.rowOf(g, targetUuid)?.alive === false, { message: '처형됨' });
}

/** 그 사람 탈주 줄 (DB) → [{ reason, game_id, deserted_at, blocked_until }] */
const desertionRows = (uuid) => query(
    'SELECT reason, game_id, deserted_at, blocked_until FROM game_desertions WHERE user_id = ? ORDER BY deserted_at',
    [uuid],
);

/** 지갑 골드 (DB) */
async function gold(uuid) {
    const rows = await query('SELECT balance_gold FROM economy_wallets WHERE user_id = ?', [uuid]);
    return Number(rows[0]?.balance_gold ?? 0);
}

/** 판 전적의 그 사람 승패 (DB, 판 끝 저장 뒤) → true·false·null(줄 없음) */
async function wonOf(gameId, uuid) {
    let row = null;
    await expect.poll(async () => {
        [row] = await query('SELECT won FROM game_result_players WHERE game_id = ? AND user_id = ?', [gameId, uuid]);
        return Boolean(row);
    }, { timeout: 30_000, message: '판 전적 줄' }).toBe(true);
    return Boolean(row.won);
}

/** 관리자 창 열기 (새 관리자 계정·Access 흉내·OTP 로그인) → { page, admin, close } */
async function openAdmin(browser, { viewport = { width: 1280, height: 800 } } = {}) {
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    const admin = await admins.createAdmin();
    await admins.loginAsAdmin(page, admin);
    return { context, page, admin, close: () => context.close() };
}

/** 로그인한 관리자 창 쿠키로 관리자 API (쓰기 확인 값은 /auth/me에서) → 답 몸 */
async function adminApi(adminPage, method, pathname, data) {
    const request = adminPage.context().request;
    const me = await request.get(`${E2E.adminUrl}/admin-api/auth/me`);
    expect(me.ok(), `관리자 세션 확인 (${me.status()})`).toBe(true);
    const { csrfToken } = await me.json();
    const res = await request.fetch(`${E2E.adminUrl}/admin-api${pathname}`, {
        method, data, headers: { origin: E2E.adminUrl, 'x-admin-csrf': csrfToken },
    });
    expect(res.ok(), `${method} ${pathname} (${res.status()})`).toBe(true);
    return res.json();
}

/** 관리자 회원 상세 화면 → 탈주 기록 표 (넓은 화면은 표, 이름표는 caption "탈주 기록") */
async function openDesertions(adminPage, uuid) {
    await adminPage.goto(`/members/${uuid}`);
    await expect(adminPage.getByRole('heading', { name: '탈주 기록' })).toBeVisible({ timeout: 20_000 });
    return adminPage.getByRole('table', { name: '탈주 기록' });
}

/** 탈주 기록 표에서 그 판 줄 → 칸 글 { desertedAt, reason, blockedUntil, state } */
async function desertionCells(table, gameId) {
    const row = table.getByRole('row').filter({ hasText: gameId });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    const [desertedAt, reason, blockedUntil, state] = await row.getByRole('cell').allInnerTexts();
    return { row, desertedAt, reason, blockedUntil, state };
}

/** "2026-11-16 21:05" → 분 단위 ms (한국 시각 글을 그대로 셈 — 두 칸 차이만 봄) */
function minuteMs(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
    if (!m) throw new Error(`시각 글 모양이 아님: ${text}`);
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/** 카드 메뉴에 "투표하기"가 없음 (메뉴가 아예 안 열려도 됨) */
async function expectNoVoteItem(page, nickname) {
    await A.calm(page, () => night.cardButton(page, nickname).click({ timeout: 1500 }));
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await page.waitForTimeout(600);
    if (await menu.isVisible().catch(() => false)) {
        await expect(menu.getByRole('menuitem', { name: '투표하기', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape').catch(() => {});
    }
}

module.exports = {
    U, nick, TOL, GRACE_MS, REOPEN_AT_MS, ROOMY, FAST, TEXT, ROLE_WORDS,
    openPeople, compositionOf, rolePlan, seat, botsBy, socketGate, goOffline, goOnline,
    expectStatus, statusAt, watchStatus, statusSeen, eventAt, reloadIngame, expectNoRoleOnCard, collectDialogs, expectForfeited,
    deadlineOf, phaseLabel, readClock, expectMyRole, toVote, pickDefendant, botsJudge, execute,
    desertionRows, gold, wonOf, openAdmin, adminApi, openDesertions, desertionCells, minuteMs, expectNoVoteItem,
};
