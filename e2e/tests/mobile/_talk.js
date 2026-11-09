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

// 칸 고르개 (화면 글자·aria-label 먼저, 카톡형 칸 표시는 data-* 그대로)
const talk = {
    layout: (page) => page.locator('[data-talk-layout]'),
    strip: (page) => page.getByRole('region', { name: '플레이어 초상 띠' }),
    slot: (page, nickname) => talk.strip(page).getByRole('button', { name: new RegExp(`^${nickname}(,|$)`) }),
    mySlot: (page) => talk.strip(page).getByRole('button', { name: /, 나(,|$)/ }),
    board: (page) => page.getByRole('region', { name: '플레이어 카드' }),
    boardSlot: (page, nickname) => talk.board(page).getByRole('button', { name: new RegExp(`^${nickname}(,|$)`) }),
    chat: (page) => page.getByRole('region', { name: '채팅', exact: true }),
    log: (page) => talk.chat(page).getByRole('log', { name: '채팅 내역' }),
    lines: (page) => talk.log(page).locator('li[data-talk-line]'),
    mine: (page) => talk.log(page).locator('li[data-talk-line="mine"]'),
    others: (page) => talk.log(page).locator('li[data-talk-line="other"]'),
    system: (page) => talk.log(page).locator('li[data-talk-line="system"]'),
    phaseLine: (page) => page.locator('[data-talk-phase-line]'),
    timebarSlot: (page) => page.locator('[data-talk-layout] [data-slot="timebar"]'),
    boardSlotArea: (page) => page.locator('[data-talk-layout] [data-slot="board"]'),
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
async function clearOverlays(page, { keepWatching = true, rounds = 3 } = {}) {
    for (let i = 0; i < rounds; i += 1) {
        let closed = false;
        for (const name of ['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과', '내 역할 보기']) {
            const dialog = page.getByRole('dialog', { name, exact: true });
            if (await dialog.isVisible().catch(() => false)) {
                await dialog.getByRole('button', { name: '확인' }).click({ timeout: 3000 }).catch(() => {});
                closed = true;
            }
        }
        if (keepWatching && await talk.deadChoice(page).isVisible().catch(() => false)) {
            await talk.deadChoice(page).getByRole('button', { name: '관전 계속하기' }).click({ timeout: 3000 }).catch(() => {});
            closed = true;
        }
        if (!closed) return;
    }
}

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
function toDay(t, pages, o = {}) { return goPhase(t, pages, 'DAY', { line: '낮 토론', ...o }); }
/** 낮 투표까지 */
function toVote(t, pages, o = {}) {
    return goPhase(t, pages, 'DAY_VOTE', o).then(async (s) => {
        const list = Array.isArray(pages) ? pages : [pages];
        for (const page of list) await expect(page.getByRole('button', { name: '기권' }).or(page.locator('[data-ingame-phase-action="dayVoteResolve"]')).first()).toBeVisible({ timeout: 15000 });
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

/** 봇 하나를 처형 (나머지 봇이 찍음, 사람은 아무것도 안 함) */
async function executeBot(t, victimUuid) {
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
};
