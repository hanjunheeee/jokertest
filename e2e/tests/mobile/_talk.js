'use strict';

// 모바일 인게임(카톡형) 시험 공통 파일, 판 차리기·단계 넘기기·연출 창 닫기·카톡형 칸 고르개
// tests/mobile/*.spec.js가 씀 (이름이 .spec이 아니라 시험으로 안 돎)
const { expect } = require('@playwright/test');
const ui = require('../../helpers/ui');
const { sleep } = require('../../helpers/wait');

// 서버 채팅 간격 0.5초 (backend game-core/chat/constants.js CHAT_MIN_INTERVAL_MS) → 조금 넉넉히
const CHAT_GAP_MS = 600;
// 서버 이모티콘 간격 1초 (EMOJI_MIN_INTERVAL_MS)
const EMOJI_GAP_MS = 1100;

// 기본 지급 이모티콘 id·이름 (frontend store/constants/storeItems.js BASIC_EMOTICONS)
const BASIC_EMOJI = Object.freeze({
    reject: { id: 'emoji-basic-reject', name: '거절' },
    tears: { id: 'emoji-basic-tears', name: '눈물' },
    hello: { id: 'emoji-basic-hello', name: '안녕' },
    love: { id: 'emoji-basic-love', name: '사랑' },
});

// 칸 읽기 이름: "닉네임", 같은 직업 동료면 "닉네임 · 동료 의사", 그 뒤에 ", 나"·", 사망"·", 연결 끊김" (frontend-mobile utils/talk/slotLabel.js)
// 닉네임으로 찾을 때 동료 글이 붙은 칸도 같이 맞게 함
const slotName = (nickname) => new RegExp(`^${nickname}( · 동료 [^,]+)?(,|$)`);

// 칸 고르개 (화면 글자·aria-label 먼저, 카톡형 칸 표시는 data-* 그대로)
const talk = {
    layout: (page) => page.locator('[data-talk-layout]'),
    // 세로 카톡형엔 카드 나열(초상 띠)이 없음 → 칸은 넓은 배치 카드 판에서 찾음 (세로에서 쓰려면 useWideBoard 먼저)
    board: (page) => page.getByRole('region', { name: '플레이어 카드' }),
    slot: (page, nickname) => talk.board(page).getByRole('button', { name: slotName(nickname) }),
    mySlot: (page) => talk.board(page).getByRole('button', { name: /, 나(,|$)/ }),
    boardSlot: (page, nickname) => talk.slot(page, nickname),
    // 세로 카톡형 플레이어 목록·직업 행동 시트 (채팅 틀 오른쪽 위 단추로 엶, 줄마다 data-roster-player=uuid)
    rosterOpen: (page) => page.locator('[data-testid="player-roster-open"]'),
    roster: (page) => page.locator('[data-testid="player-roster-sheet"]'),
    rosterRow: (page, uuid) => talk.roster(page).locator(`[data-roster-player="${uuid}"]`),
    chat: (page) => page.getByRole('region', { name: '채팅', exact: true }),
    log: (page) => talk.chat(page).getByRole('log', { name: '채팅 내역' }),
    lines: (page) => talk.log(page).locator('li[data-talk-line]'),
    mine: (page) => talk.log(page).locator('li[data-talk-line="mine"]'),
    others: (page) => talk.log(page).locator('li[data-talk-line="other"]'),
    system: (page) => talk.log(page).locator('li[data-talk-line="system"]'),
    // 단계 글: 위 단계 줄(PhaseLine)이 빠지고 명패+시간패널 한 줄로 바뀜 → "[낮-토론과 투표]"·"[밤-…]"·"[5초 뒤 마감]" (날짜 글은 없음)
    phaseLine: (page) => page.locator('[data-ingame-phase-timer-mobile]'),
    timebarSlot: (page) => page.locator('[data-talk-layout] [data-slot="timebar"]'),
    input: (page) => page.getByRole('textbox', { name: '채팅 입력' }),
    send: (page) => page.getByRole('button', { name: '채팅 보내기' }),
    actionRow: (page) => page.locator('[data-ingame-action-row]'),
    phaseAction: (page, action) => page.locator(`[data-ingame-phase-action="${action}"]`),
    cardSheet: (page) => page.locator('[data-ingame-player-card-menu]'),
    palette: (page) => page.getByRole('group', { name: '이모티콘 팔레트' }),
    deadBanner: (page) => talk.chat(page).getByText('죽은 사람끼리', { exact: true }),
    nightBanner: (page) => talk.chat(page).getByText('밤 · 같은 직업끼리', { exact: true }),
    newButton: (page) => talk.chat(page).getByRole('button', { name: '새 메시지 ↓' }),
    scroller: (page) => talk.log(page).locator('xpath=..'),
    deadChoice: (page) => page.getByRole('dialog', { name: '사망 후 선택' }),
};

/** 떠 있는 연출 창(단계 전환·밤 차례·밤 결과·역할 공개) 닫기, keepWatching이면 사망 선택도 '관전 계속하기' */
const clearOverlays = (page, { keepWatching = true, rounds = 3 } = {}) => ui.closeOverlays(page, { keepWatching, rounds });

/**
 * 모바일 사람 + 봇으로 판 차리고 역할 공개 창 닫기
 * @returns {Promise<import('../../helpers/game').Table>}
 */
async function startTalkGame(table, humans, { bots = 4, roles, settings, closeReveal = true } = {}) {
    const list = Array.isArray(humans) ? humans : [humans];
    const t = await table.setup({ humans: list, bots, roles, settings });
    if (closeReveal) {
        for (const h of list) await ui.readRoleReveal(h.page);
    }
    return t;
}

// ── 세로 카톡형 플레이어 목록 시트 (카드 판 대신, 줄마다 카드 메뉴와 같은 행동 단추) ──
// 줄 = li[data-roster-player=uuid], 이름 글 "닉네임"(+ " (나)"·동료 표시), 상태 글 "사망"·"연결 끊김", 행동 칸 group "닉네임 행동" 안 menuitem
// (frontend-mobile components/roster/PlayerRosterSheet.jsx·RosterRow.jsx) — 고르면 시트는 그대로 열려 있고 단추 글만 바뀜 (투표하기 → 투표취소)

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 목록 시트 안 그 사람 줄 (이름 글이 닉네임으로 시작, 뒤에 " (나)"·동료 표시만 붙음) */
function rosterRowOf(page, nickname) {
    const name = page.locator('p').filter({ hasText: new RegExp(`^${escapeRe(nickname)}( \\(나\\)|동료 |$)`) });
    return talk.roster(page).locator('li[data-roster-player]').filter({ has: name });
}

/** 목록 시트 열기 (열려 있으면 그대로, 앞을 막는 연출 창은 닫아 가며) → 시트 */
async function openRoster(page, { timeout = 25_000 } = {}) {
    const sheet = talk.roster(page);
    await expect(async () => {
        if (!(await sheet.isVisible().catch(() => false))) {
            await clearOverlays(page, { keepWatching: false, rounds: 1 });
            await talk.rosterOpen(page).click({ timeout: 1500 });
        }
        await expect(sheet).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout });
    return sheet;
}

/** 목록 시트 닫기 (시트 머리 닫기 단추) */
async function closeRoster(page) {
    const sheet = talk.roster(page);
    if (await sheet.isVisible().catch(() => false)) await sheet.getByRole('button', { name: '플레이어 목록 닫기' }).click();
    await expect(sheet).toBeHidden();
}

/** 목록을 열고 그 사람 줄 → 줄 (안의 menuitem이 카드 메뉴 항목: 투표하기·투표취소·암살 …) */
async function openPlayer(page, nickname) {
    await openRoster(page);
    const row = rosterRowOf(page, nickname);
    await expect(row).toHaveCount(1);
    return row;
}

/** 그 사람 줄 행동 이름 { all, enabled } (목록은 열어 둔 채) */
async function playerItems(page, nickname) {
    const row = await openPlayer(page, nickname);
    const items = row.getByRole('menuitem');
    const all = [];
    const enabled = [];
    for (let i = 0; i < await items.count(); i += 1) {
        const name = await items.nth(i).getAttribute('aria-label');
        all.push(name);
        if (await items.nth(i).isEnabled()) enabled.push(name);
    }
    return { all, enabled };
}

/**
 * 목록에서 그 사람 줄 행동 누르기 → 그 줄 단추가 after로 바뀌면 서버가 받은 것 (예: '투표하기' → '투표취소')
 * after를 안 주면 누르기만 함, close면 끝나고 목록 닫음
 */
async function pickPlayer(page, nickname, label, { after = null, close = true } = {}) {
    const row = await openPlayer(page, nickname);
    await row.getByRole('menuitem', { name: label, exact: true }).click();
    if (after) {
        await expect(async () => {
            const again = await openPlayer(page, nickname);
            await expect(again.getByRole('menuitem', { name: after, exact: true })).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 15_000 });
    }
    if (close) await closeRoster(page);
}

const PLAYER_STATUS = Object.freeze(['사망', '연결 끊김']);

/**
 * 목록 시트에서 그 사람 상태 글 확인 (옛 초상 띠 칸 읽기 이름 ", 사망"·", 연결 끊김" 대신)
 * status: '사망' | '연결 끊김' | null(살아 있고 붙어 있음 → 상태 글 없음), 연출 창이 목록을 닫아도 다시 열며 봄, 본 뒤 목록 닫음
 */
async function expectPlayerStatus(page, nickname, status, { timeout = 15_000 } = {}) {
    await expect(async () => {
        await openRoster(page, { timeout: 5_000 });
        const row = rosterRowOf(page, nickname);
        await expect(row).toHaveCount(1, { timeout: 1_000 });
        for (const word of PLAYER_STATUS) {
            await expect(row.getByText(word, { exact: true })).toHaveCount(word === status ? 1 : 0, { timeout: 1_000 });
        }
    }).toPass({ timeout });
    await closeRoster(page);
}

/** 목록 시트 줄 수가 n인지 (판 자리 수, 옛 초상 띠 칸 수 대신), 본 뒤 목록 닫음 */
async function expectRosterCount(page, n, { timeout = 30_000 } = {}) {
    await expect(async () => {
        const sheet = await openRoster(page, { timeout: 5_000 });
        await expect(sheet.locator('li[data-roster-player]')).toHaveCount(n, { timeout: 1_000 });
    }).toPass({ timeout });
    await closeRoster(page);
}

// ── 세로 카톡형 재판: 고발 연출(1초 남짓) 뒤 채팅 틀 "최후의 변론" 단추 → 시트 안에 피고 카드·유죄·무죄·안내 글 ──

/**
 * 투표 현황 창이 떠 있으면 닫음 → 닫았으면 참
 * 모바일(상대 화면)은 재판 연출이 떠도 현황 창을 저절로 안 닫아서 "최후의 변론" 단추를 덮음
 */
async function closeVoteStatus(page) {
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    if (!(await panel.isVisible().catch(() => false))) return false;
    await panel.getByRole('button', { name: '투표 현황 닫기' }).click({ timeout: 1500 }).catch(() => {});
    return true;
}

/** 재판 시트 열기 (열려 있으면 그대로, 고발 연출이 끝나 "최후의 변론" 단추가 뜰 때까지, 덮는 투표 현황 창은 닫음) → 시트 */
async function openTrialSheet(page, { timeout = 25_000 } = {}) {
    const sheet = page.getByTestId('tribunal-presentation-sheet');
    await expect(async () => {
        if (!(await sheet.isVisible().catch(() => false))) {
            await closeVoteStatus(page);
            await clearOverlays(page, { keepWatching: false, rounds: 1 });
            await page.getByTestId('tribunal-presentation-open').click({ timeout: 1500 });
        }
        await expect(sheet).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout });
    return sheet;
}

/** 재판 시트가 열려 있으면 닫음 (시트 머리 "최후의 변론 닫기") */
async function closeTrialSheet(page) {
    const sheet = page.getByTestId('tribunal-presentation-sheet');
    if (await sheet.isVisible().catch(() => false)) await sheet.getByRole('button', { name: '최후의 변론 닫기' }).click();
    await expect(sheet).toBeHidden();
}

/**
 * 세로 카톡형 재판 중 채팅: 재판 창 안 채팅 칸은 없고, 말은 채팅방·바닥 입력 줄 그대로 씀 (frontend-mobile talk/TalkLayout.jsx)
 * 고발 연출(피고 지목 글·초상, 1.5초 남짓) 동안만 채팅방이 잠기고 입력 줄이 꺼짐 → 연출이 끝나 "최후의 변론" 단추가 뜨고 입력 줄이 풀릴 때까지
 * 죽은 사람은 입력 줄이 죽은 사람끼리 채널로 풀림
 */
async function waitTrialTalk(page, { timeout = 20_000 } = {}) {
    await expect(page.getByTestId('tribunal-presentation-open')).toBeVisible({ timeout });
    await expect(page.locator('[data-ingame-tribunal-presentation]')).toHaveCount(0, { timeout });
    await closeTrialSheet(page);
    await expect(talk.input(page)).toBeEnabled({ timeout });
    // 잠금은 입력 줄을 끄지 않고 감싼 칸에 inert를 검 → inert 밖인지로 봄
    await expect.poll(() => talk.input(page).evaluate((el) => !el.closest('[inert]')), { timeout, message: '입력 줄이 잠긴 칸 밖' }).toBe(true);
}

/** 재판이 열린 표시: 고발 연출·"최후의 변론" 단추·시트 중 하나 (재판이 없으면 셋 다 없음) */
const trialAny = (page) => page.locator('[data-ingame-tribunal-presentation], [data-testid="tribunal-presentation-open"], [data-testid="tribunal-presentation-sheet"]');

/** 재판이 열렸고 피고가 그 사람인지: 시트 설명 "피고: 닉네임"을 보고 시트를 닫음 */
async function expectTrialOf(page, nickname, { timeout = 15_000 } = {}) {
    await expect(trialAny(page).first()).toBeVisible({ timeout });
    const sheet = await openTrialSheet(page);
    await expect(sheet).toContainText(`피고: ${nickname}`);
    await sheet.getByRole('button', { name: '최후의 변론 닫기' }).click();
    await expect(sheet).toBeHidden();
}

/** 폰 가로(넓은 배치): 카드 판·카드 메뉴·이모티콘 팔레트 (세로 카톡형에는 카드 나열 없음) */
async function useWideBoard(page) {
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(talk.board(page)).toBeVisible({ timeout: 20000 });
}

/**
 * 그 날·단계인지: 모바일(상대 화면) 세로 명패 줄엔 날짜 글이 없음("[낮-토론과 투표]"만, 커밋 d71ab651)
 * → 날짜는 서버 판 값(dayIndex)으로, 화면은 명패 단계 글("[낮"·"[밤")로 봄
 */
async function expectDayLine(page, t, day, { word = '낮', timeout = 15_000 } = {}) {
    await expect.poll(async () => (await t.state())?.dayIndex, { timeout, message: `서버 날짜 제 ${day}일` }).toBe(day);
    await expect(talk.phaseLine(page)).toContainText(`[${word}`, { timeout });
}

/** 단계 넘기기 → 사람 화면 단계 줄이 맞을 때까지 → 연출 창 닫기 */
async function goPhase(t, pages, target, { line, stepDelayMs = 400, keepWatching = true } = {}) {
    const s = await t.advanceUntil(target, { stepDelayMs });
    const list = Array.isArray(pages) ? pages : [pages];
    for (const page of list) {
        if (line) await expect(talk.phaseLine(page)).toContainText(line, { timeout: 15000 });
        // 단계 전환 안내는 단계가 바뀐 뒤 바로 뜸 → 잠깐 기다렸다 닫음
        await page.getByRole('dialog', { name: '단계 전환 안내' }).waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        await clearOverlays(page, { keepWatching });
    }
    return s;
}

/** 낮 토론까지 (제 1일) */
function toDay(t, pages, o = {}) { return goPhase(t, pages, 'DAY', { line: '낮', ...o }); }
/** 낮 투표까지 (산 사람 화면은 기권 단추가 뜰 때까지, 죽은 사람 화면엔 기권 단추가 없어 내 칸의 사망 표시·"죽은 사람끼리" 띠로 대신 봄) */
function toVote(t, pages, o = {}) {
    return goPhase(t, pages, 'DAY_VOTE', o).then(async (s) => {
        const list = Array.isArray(pages) ? pages : [pages];
        for (const page of list) {
            const abstain = page.getByRole('button', { name: '기권' });
            // 내 칸은 넓은 배치 카드 판에만 있음 → 세로 카톡형은 채팅방 "죽은 사람끼리" 띠로 봄
            const deadSelf = page.getByRole('button', { name: /, 나, 사망$/ }).or(talk.deadBanner(page));
            await expect(abstain.or(deadSelf).first()).toBeVisible({ timeout: 15000 });
        }
        return s;
    });
}
/** 밤까지 */
function toNight(t, pages, o = {}) { return goPhase(t, pages, 'NIGHT', { line: '밤', ...o }); }

/** 카톡형 입력칸으로 말 보내고 내 말풍선이 보일 때까지 (서버 간격 지키려고 조금 쉼) */
async function say(page, text) {
    await talk.input(page).fill(text);
    await talk.send(page).click();
    await expect(talk.mine(page).filter({ hasText: text }).last()).toBeVisible();
    await sleep(CHAT_GAP_MS);
}

/** 봇 하나가 판 채팅 보내기 (낮이면 낮 채널, 죽었으면 죽은 사람 채널, 밤이면 같은 직업 채널은 jokerSay) */
async function botSay(t, botIndex, text) {
    const reply = await t.bots[botIndex].request('submit_game_chat_message', { gameId: t.gameId, text });
    await sleep(CHAT_GAP_MS);
    return reply;
}

/** 봇이 밤 같은 직업 채팅 보내기 */
async function botNightSay(t, botIndex, text) {
    const reply = await t.bots[botIndex].request('submit_joker_chat_message', { gameId: t.gameId, text });
    await sleep(CHAT_GAP_MS);
    return reply;
}

/** 봇이 이모티콘 보내기 (기본 지급 이모티콘) */
async function botEmoji(t, botIndex, itemId = BASIC_EMOJI.hello.id) {
    const reply = await t.bots[botIndex].request('send_emoji', { gameId: t.gameId, itemId });
    await sleep(EMOJI_GAP_MS);
    return reply;
}

/** 봇이 판에서 나가기 (나간 사람은 죽은 것으로 바뀜) */
async function botLeave(t, botIndex) {
    return t.bots[botIndex].request('leave_game_session', { gameId: t.gameId });
}

/** 봇들이 나를 처형하게 해서 내가 죽을 때까지 (봇은 밤에 아무도 안 찍음) */
async function getExecuted(t, me, { deadChat, keepWatching = true, pages = [] } = {}) {
    // 봇 표가 기권(사람·나)보다 많아야 재판 → 아니면 단계만 넘기다 시간 넘으니 바로 알림
    await t.assertBotsCanExecute(me);
    t.playBots({ dayVote: me, tribunal: 'GUILTY', night: 'skip', deadChat });
    const s = await t.advanceUntil((g) => g.players.find((p) => p.uuid === me)?.alive === false, { stepDelayMs: 1200, maxSteps: 60 });
    // 내가 죽은 뒤엔 봇이 아무도 안 찍게 (판이 저절로 끝나지 않게)
    await t.stopBots();
    t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip', deadChat });
    for (const page of pages) {
        // 사망 후 선택 창은 처형 연출 뒤에 뜸 → 창이 뜰 때까지 기다렸다 닫음
        await expect(talk.deadChoice(page)).toBeVisible({ timeout: 30000 });
        if (!keepWatching) continue;
        // 처형 연출 등 앞 연출이 열리면 창이 잠깐 숨었다 다시 뜸 → '관전 계속하기'가 실제로 눌릴 때까지
        let chosen = false;
        await expect.poll(async () => {
            await clearOverlays(page, { keepWatching: false });
            const dialog = talk.deadChoice(page);
            if (!chosen && await dialog.isVisible().catch(() => false)) {
                chosen = await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 3000 }).then(() => true, () => false);
            }
            return chosen && !(await dialog.isVisible().catch(() => false));
        }, { timeout: 30000, intervals: [500] }).toBe(true);
    }
    return s;
}

/** 봇 하나를 처형 (나머지 봇이 찍음, 사람은 아무것도 안 함) — 사람이 많으면 봇 표가 모자라 던짐 (5명 판 사람 1·봇 4는 됨) */
async function executeBot(t, victimUuid) {
    await t.assertBotsCanExecute(victimUuid);
    t.playBots({ dayVote: victimUuid, tribunal: 'GUILTY', night: 'skip' });
    const s = await t.advanceUntil((g) => g.players.find((p) => p.uuid === victimUuid)?.alive === false, { stepDelayMs: 1200, maxSteps: 60 });
    await t.stopBots();
    t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
    return s;
}

/** 판에서 광대인 봇 (역할을 나만 정했을 때 광대 봇 찾기) */
async function jokerBot(t) {
    const s = await t.state();
    const uuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    return t.bots.find((b) => b.account.uuid === uuid) ?? null;
}

/** 가로 넘침(px), 0 이하면 안 넘침 */
function overflowX(page) {
    return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** 요소 바탕색 (rgb 글) */
function bgColor(locator) {
    return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** 플레이어 닉네임 찾기 */
async function nicknameOf(t, uuid) {
    const s = await t.state();
    return s.players.find((p) => p.uuid === uuid)?.nickname;
}

module.exports = {
    talk, clearOverlays, startTalkGame, goPhase, toDay, toVote, toNight, say, botSay, botNightSay, botEmoji, botLeave,
    getExecuted, executeBot, jokerBot, overflowX, bgColor, nicknameOf, sleep, BASIC_EMOJI, CHAT_GAP_MS, EMOJI_GAP_MS,
    useWideBoard, rosterRowOf, openRoster, closeRoster, openPlayer, playerItems, pickPlayer, openTrialSheet,
    closeTrialSheet, waitTrialTalk, trialAny, expectTrialOf, expectPlayerStatus, expectRosterCount, closeVoteStatus, expectDayLine,
};
