'use strict';

// 방·결과 시험 공통 동작 파일, 설정 칸 읽기·바꾸기·화면으로 방 만들기·사람이 방장인 판·판 끝내기·결과 화면 기다리기
// tests/room·tests/result 시험이 씀 (spec 아니라 Playwright가 시험으로 안 셈)
const { expect } = require('@playwright/test');
const { e2e } = require('../../helpers/internal');
const { Table } = require('../../helpers/game');
const ui = require('../../helpers/ui');
const { E2E } = require('../../helpers/env');

const { sleep } = require('../../helpers/wait');

// ── 설정 화면 ──

/** 게임 설정 화면 열기 (방 찾기 거치지 않고 주소로) */
async function openSetup(page) {
    await page.goto('/game-setup');
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();
}

/** 설정 줄 하나 (좌우 화살표 이름으로 찾음) */
function stepperRow(page, label) {
    return page.locator('[data-setup-row]').filter({ has: page.getByRole('button', { name: `${label} 감소`, exact: true }) });
}

/** 숫자·고르기 칸 지금 글자 (예: '60초', '10', '자동') */
async function stepperValue(page, label) {
    return (await stepperRow(page, label).locator('div.relative > span').innerText()).trim();
}

/** 숫자 칸을 목표 값까지 화살표로 맞춤 (단위 글자는 떼고 비교) */
async function setStepper(page, label, target) {
    for (let i = 0; i < 16; i += 1) {
        const now = parseInt(await stepperValue(page, label), 10);
        if (now === target) return;
        await page.getByRole('button', { name: `${label} ${now < target ? '증가' : '감소'}`, exact: true }).click();
        await expect.poll(async () => parseInt(await stepperValue(page, label), 10)).not.toBe(now);
    }
    throw new Error(`${label}을 ${target}로 못 맞춤`);
}

/** 고르기 칸(역할 구성)을 글자로 맞춤 */
async function setChoice(page, label, text) {
    for (let i = 0; i < 4; i += 1) {
        if (await stepperValue(page, label) === text) return;
        const inc = page.getByRole('button', { name: `${label} 증가`, exact: true });
        if (await inc.isEnabled()) await inc.click();
        else await page.getByRole('button', { name: `${label} 감소`, exact: true }).click();
    }
    expect(await stepperValue(page, label)).toBe(text);
}

/** 체크 칸 켜기·끄기 */
async function setCheck(page, label, on) {
    const box = page.getByRole('checkbox', { name: label, exact: true });
    if ((await box.getAttribute('aria-checked')) !== String(on)) await box.click();
    await expect(box).toHaveAttribute('aria-checked', String(on));
}

/** 탭 고르기 ('일반' | '회의&투표') */
async function selectTab(page, name) {
    await page.getByRole('navigation', { name: '인게임 설정 탭' }).getByRole('button', { name, exact: true }).click();
}

const ROLE_LABEL = { JOKER: '광대', DOCTOR: '의사', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' };

/**
 * 열린 설정 패널 칸 채우기 (만들기·편집 둘 다)
 * @param {object} o code·maxPlayers·jokers·lightsOut·soulBetting·custom({JOKER..})·discussion·vote·tribunal·night·roleNights({JOKER:60})·voteReveal
 */
async function fillSettings(page, o = {}) {
    await selectTab(page, '일반');
    if (o.code !== undefined) await setCheck(page, '코드로만 참가', o.code);
    if (o.maxPlayers !== undefined) await setStepper(page, '최대 플레이어 수', o.maxPlayers);
    if (o.jokers !== undefined && !o.custom) await setStepper(page, '광대(마피아) 플레이어 수', o.jokers);
    if (o.lightsOut !== undefined) await setCheck(page, '불이 꺼진 무도회', o.lightsOut);
    if (o.soulBetting !== undefined) await setCheck(page, '영혼의 베팅 활성화', o.soulBetting);
    if (o.custom) {
        await setChoice(page, '역할 구성', '직접 지정');
        for (const [role, n] of Object.entries(o.custom)) await setStepper(page, `${ROLE_LABEL[role]} 인원`, n);
    }
    const meeting = ['discussion', 'vote', 'tribunal', 'night', 'roleNights', 'voteReveal'].some((k) => o[k] !== undefined);
    if (!meeting) return;
    await selectTab(page, '회의&투표');
    if (o.discussion !== undefined) await setStepper(page, '낮 토론 시간 조절', o.discussion);
    if (o.vote !== undefined) await setStepper(page, '낮 투표 시간 조절', o.vote);
    if (o.tribunal !== undefined) await setStepper(page, '재판 시간 조절', o.tribunal);
    if (o.night !== undefined) await setStepper(page, '밤 행동 시간 조절', o.night);
    for (const [role, n] of Object.entries(o.roleNights ?? {})) await setStepper(page, `${ROLE_LABEL[role]} 밤 시간 조절`, n);
    if (o.voteReveal !== undefined) await setCheck(page, '투표 공개 여부', o.voteReveal);
}

/** 서버 방 요약이 생길 때까지 (방장 uuid로) */
async function waitRoom(uuid, match = () => true) {
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(uuid); return Boolean(room && match(room)); }, { timeout: 10000 }).toBe(true);
    return room;
}

/**
 * 화면으로 방 만들기 → 대기방 → 서버 방 요약 돌려줌
 * @param {{page, account}} who 로그인된 사람
 */
async function createRoomUi(who, o = {}) {
    await openSetup(who.page);
    await fillSettings(who.page, o);
    await who.page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(who.page).toHaveURL(/\/game-matching/);
    await expect(who.page.getByRole('button', { name: '게임시작' })).toBeVisible();
    return waitRoom(who.account.uuid);
}

// ── 대기방 ──

/** 대기방 파티 인원 글자 기다림 */
async function expectPartyCount(page, n) {
    await expect(page.getByText(`파티 인원 ${n}명`)).toBeVisible();
}

/** 준비한 사람 실루엣 수 */
function readySilhouettes(page) {
    return page.getByRole('img', { name: '준비 완료한 참가자' });
}

/** 시작 막힘 창 */
function blockedDialog(page) {
    return page.locator('[data-game-start-blocked]');
}

/** 봇들 입장 + 준비 (방 설정 버전은 지금 서버 값) */
async function botsJoinAndReady(bots, uuidOfHost, roomCode) {
    for (const bot of bots) await bot.joinByCode(roomCode);
    const room = await e2e.roomOf(uuidOfHost);
    for (const bot of bots) await bot.setReady(room.roomId, room.settingsVersion);
    return room;
}

/**
 * 사람이 방장인 판 차리기: 화면으로 방 만들기 → 손님(사람) 코드 입장·준비 → 봇 입장·준비 → 역할 → 방장 준비·시작
 * @returns {Promise<Table>} gameId 들어 있음 (봇은 bots 도우미가 닫음)
 */
async function hostGame({ host, guests = [], botList = [], roles = null, settings = {} }) {
    const room = await createRoomUi(host, { jokers: 1, ...settings });
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, room.roomCode);
    for (const g of guests) await ui.readyUi(g.page);
    for (const g of guests) await expect(g.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    if (botList.length > 0) await botsJoinAndReady(botList, host.account.uuid, room.roomCode);
    if (roles) await e2e.setRoles(roles);
    await expect(host.page.getByText(`파티 인원 ${1 + guests.length + botList.length}명`)).toBeVisible();
    await ui.readyUi(host.page);
    await expect(host.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await host.page.getByRole('button', { name: '게임시작' }).click();
    for (const p of [host, ...guests]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    const game = await e2e.gameOf(host.account.uuid);
    const t = new Table({ room, bots: botList, humans: [host, ...guests] });
    t.gameId = game.gameId;
    return t;
}

// ── 판 끝내기·결과 ──

/** 판 끝날 때까지 단계 넘기기 → 마지막 판 요약 (끝나 장부에서 빠지면 null) */
async function finishGame(t, { stepDelayMs = 900, maxSteps = 40 } = {}) {
    let last = null;
    for (let i = 0; i < maxSteps; i += 1) {
        const s = await t.state();
        if (!s) return last;
        last = s;
        if (s.phase === 'ENDED' || s.winResult) return s;
        await t.advance().catch(() => {});
        await sleep(stepDelayMs);
    }
    throw new Error('판이 안 끝남');
}

/** 결과 화면 본체가 보일 때까지 (연출 영상이 막히면 건너뛰기) */
async function waitResult(page) {
    await expect(page).toHaveURL(/\/gameresult/, { timeout: 30000 });
    const list = page.getByRole('region', { name: '가면무도회 참가자 정체' });
    const skip = page.getByRole('button', { name: '건너뛰기' });
    await expect(list.or(skip)).toBeVisible({ timeout: 30000 });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(list).toBeVisible({ timeout: 30000 });
    return list;
}

/** 역할 공개 창 닫기 (여럿) */
async function closeReveals(pages) {
    await Promise.all(pages.map((p) => ui.readRoleReveal(p).catch(() => null)));
}

/**
 * 결과 판 차리기 (봇 방장): 나 + 봇 n, 역할 정하고 끝까지 → 결과 화면
 * kind: 'jokerWin'(나 광대·봇 시민 1) | 'jokerLose'(나 시민·봇 광대 1) | 'citizenWin'(나 시민·봇 광대·봇 시민, 봇 시민이 광대 처형)
 */
async function playToResult({ user, table, kind = 'jokerWin', extraHumans = [] }) {
    const me = user.account.uuid;
    let joker = null;
    const humans = [user, ...extraHumans];
    let t;
    if (kind === 'jokerWin') {
        // 사람이 더 있으면 봇도 광대로 (광대 2 : 시민 = 바로 광대 승)
        const extra = extraHumans.length > 0;
        t = await table.setup({
            humans, bots: 1, settings: extra ? { jokerCount: 2 } : {},
            roles: ({ bots }) => ({ [me]: 'JOKER', ...Object.fromEntries(extraHumans.map((x) => [x.account.uuid, 'CITIZEN'])), [bots[0].account.uuid]: extra ? 'JOKER' : 'CITIZEN' }),
        });
        joker = me;
    } else if (kind === 'jokerLose') {
        t = await table.setup({ humans, bots: 1, roles: ({ bots }) => { joker = bots[0].account.uuid; return { [me]: 'CITIZEN', [joker]: 'JOKER' }; } });
    } else {
        t = await table.setup({ humans, bots: 2, roles: ({ bots }) => { joker = bots[0].account.uuid; return { [me]: 'CITIZEN', [joker]: 'JOKER', [bots[1].account.uuid]: 'CITIZEN' }; } });
        t.playBots((bot) => (bot.account.uuid === joker
            ? { dayVote: 'abstain', tribunal: 'skip', night: 'skip' }
            : { dayVote: joker, tribunal: 'GUILTY', night: 'skip' }));
    }
    await closeReveals(humans.map((h) => h.page));
    const end = await finishGame(t, { stepDelayMs: kind === 'citizenWin' ? 1200 : 900 });
    const list = await waitResult(user.page);
    return { t, joker, end, list };
}

/** 결과 목록에서 이름 줄 하나 */
function resultRow(page, name) {
    return page.getByRole('region', { name: '가면무도회 참가자 정체' }).getByRole('listitem').filter({ hasText: name });
}

// ── 방 목록 ──

/** 방 목록에서 제목으로 줄 찾기 (쪽 넘기며), 못 찾으면 null */
async function findRoomRow(page, title, { timeoutMs = 10000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const panel = page.getByRole('region', { name: '공개 방 목록' });
    await expect(panel).toBeVisible();
    while (Date.now() < deadline) {
        // 첫 쪽으로
        const prev = panel.getByRole('button', { name: '이전 페이지' });
        while (await prev.isEnabled().catch(() => false)) await prev.click();
        for (let i = 0; i < 30; i += 1) {
            const row = panel.getByRole('button', { name: new RegExp(`^${escapeRe(title)},`) });
            if (await row.count() > 0) return row.first();
            const next = panel.getByRole('button', { name: '다음 페이지' });
            if (!(await next.isEnabled().catch(() => false))) break;
            await next.click();
        }
        await sleep(400);
    }
    return null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 멀티플레이 방 목록 화면 열기 */
async function openRoomList(page) {
    await page.goto('/multiplay');
    await expect(page.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
}

// ── 친구 맺기 (API) ──

/** a가 b에게 친구 신청 → b가 수락 (둘 다 context 로그인됨) */
async function makeFriends(a, b) {
    const headers = { origin: E2E.desktopUrl };
    const sent = await a.context.request.post(`${E2E.apiUrl}/friends/requests`, { data: { receiverId: b.account.uuid }, headers });
    if (!sent.ok()) throw new Error(`친구 신청 실패 ${sent.status()} ${await sent.text()}`);
    const incoming = await b.context.request.get(`${E2E.apiUrl}/friends/requests/incoming`, { headers });
    const body = await incoming.json();
    const list = body?.data?.requests ?? body?.data ?? body?.requests ?? [];
    const req = (Array.isArray(list) ? list : []).find((r) => JSON.stringify(r).includes(a.account.uuid));
    if (!req) throw new Error(`받은 신청 없음 ${JSON.stringify(body).slice(0, 300)}`);
    const id = req.request_id ?? req.requestId;
    const acc = await b.context.request.put(`${E2E.apiUrl}/friends/requests/${id}/accept`, { headers });
    if (!acc.ok()) throw new Error(`친구 수락 실패 ${acc.status()} ${await acc.text()}`);
}

module.exports = {
    sleep, openSetup, stepperRow, stepperValue, setStepper, setChoice, setCheck, selectTab, fillSettings, waitRoom, createRoomUi,
    expectPartyCount, readySilhouettes, blockedDialog, botsJoinAndReady, hostGame, finishGame, waitResult, closeReveals,
    playToResult, resultRow, findRoomRow, openRoomList, makeFriends, ROLE_LABEL,
};

/** 봇 방장이 방 설정 바꾸기 (지금 서버 값에 changes 덮어씀) → ack */
async function botUpdateSettings(bot, changes = {}) {
    const live = await e2e.roomOf(bot.uuid);
    const s = live.settings;
    const payload = {
        roomId: live.roomId, requestId: require('node:crypto').randomUUID(), expectedSettingsVersion: live.settingsVersion,
        accessType: changes.accessType ?? 'open', maxPlayers: s.maxPlayers, jokerCount: s.jokerCount,
        roleCompositionMode: s.roleCompositionMode ?? 'auto', dayDiscussionTime: s.dayDiscussionTime, dayVoteTime: s.dayVoteTime,
        nightActionTime: s.nightActionTime, ...(s.tribunalTime ? { tribunalTime: s.tribunalTime } : {}),
        ...(s.roleCounts ? { roleCounts: s.roleCounts } : {}), ...changes,
    };
    return bot.request('update_room_settings', payload);
}
module.exports.botUpdateSettings = botUpdateSettings;
