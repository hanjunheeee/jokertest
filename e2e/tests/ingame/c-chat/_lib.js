'use strict';

// C 파트(채팅·죽은 사람·연결·화면 도구) 공통 도우미 파일, 덮개 창 닫기·채팅 보내기/확인·사람 죽이기·판 차리기를 짧게
// tests/ingame/c-chat/*.spec.js가 씀 (이름이 .spec.js가 아니라 시험으로 안 셈)
const { expect } = require('@playwright/test');
const { sleep } = require('../../../helpers/bots');
const ui = require('../../../helpers/ui');
const { internal } = require('../../../helpers/internal');
const db = require('../../../helpers/db');

// 확인 버튼 하나로 닫히는 양피지 창 이름 (단계 안내·밤 차례·밤 결과·알림·역할 보기)
const CONFIRM_DIALOGS = ['단계 전환 안내', '밤 역할 안내', '밤 조사 결과', '알림', '내 역할 보기'];

/** 덮개 창 닫기: 확인 창들 + (keepWatching면) 사망 뒤 선택에서 관전 계속하기 */
async function dismissOverlays(page, { keepWatching = true, rounds = 4 } = {}) {
    for (let r = 0; r < rounds; r += 1) {
        let clicked = false;
        for (const name of CONFIRM_DIALOGS) {
            const dialog = page.getByRole('dialog', { name, exact: true });
            if (await dialog.isVisible().catch(() => false)) {
                await dialog.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
                clicked = true;
            }
        }
        if (keepWatching) {
            const dead = page.getByRole('dialog', { name: '사망 후 선택' });
            if (await dead.isVisible().catch(() => false)) {
                await dead.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 }).catch(() => {});
                clicked = true;
            }
        }
        if (!clicked) return;
        await sleep(150);
    }
}

const chatBox = (page) => page.getByRole('textbox', { name: '채팅 입력' });
const chatLog = (page) => page.getByRole('log', { name: '채팅 내역' });
const sendButton = (page) => page.getByRole('button', { name: '채팅 보내기' });
/** 채팅 줄 글자 모양: 닉네임: "글" */
const line = (nickname, text) => `${nickname}:"${text}"`;

/** 채팅 칸이 쓸 수 있게 될 때까지 (덮개 창 닫으면서, 화면 잠금 inert 풀릴 때까지) */
async function readyToChat(page, { timeoutMs = 25000, keepWatching = true } = {}) {
    const until = Date.now() + timeoutMs;
    for (;;) {
        await dismissOverlays(page, { keepWatching });
        // 재판 추방 연출: 글 단계에서 누르면 바로 끝남 (영상 단계 누름은 아무 일 없음)
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
        if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
        const box = chatBox(page);
        const ok = await box.evaluate((el) => !el.closest('[inert]') && !el.disabled).catch(() => false);
        if (ok && await box.isVisible().catch(() => false)) return box;
        if (Date.now() > until) throw new Error('채팅 칸이 안 열림 (덮개 창·잠금)');
        await sleep(250);
    }
}

// 서버 채팅 간격 0.5초 (game-core/chat/constants.js) → 같은 화면에서 연달아 보낼 때 쉼
const lastSent = new WeakMap();

/**
 * 화면에서 채팅 보내기 (기본 Enter)
 * @param {'enter'|'button'} [o.via]
 * @param {boolean} [o.expectCleared=true] 보낸 뒤 입력칸이 비는지(서버가 받음)까지 기다림
 */
async function say(page, text, { via = 'enter', expectCleared = true, ready = true } = {}) {
    if (ready) await readyToChat(page);
    const gap = 600 - (Date.now() - (lastSent.get(page) ?? 0));
    if (gap > 0) await sleep(gap);
    const box = chatBox(page);
    await box.fill(text);
    if (via === 'button') await sendButton(page).click();
    else await box.press('Enter');
    lastSent.set(page, Date.now());
    if (expectCleared) await expect(box).toHaveValue('', { timeout: 8000 });
}

async function expectLine(page, nickname, text, o = {}) {
    await expect(chatLog(page)).toContainText(line(nickname, text), o);
}

/** 일정 시간 동안 그 글이 안 보이는지 (안 와야 하는 것 확인, 먼저 다른 확인으로 시간 벌고 부름) */
async function expectNoText(page, text, { waitMs = 1500 } = {}) {
    await sleep(waitMs);
    await expect(chatLog(page)).not.toContainText(text);
}

/** 채팅 한 줄의 data-chat-channel (DAY·DEAD·JOKER, 없으면 null) */
async function lineChannel(page, text) {
    const row = chatLog(page).getByRole('listitem').filter({ hasText: text }).first();
    await expect(row).toBeVisible();
    return row.getAttribute('data-chat-channel');
}

/** 채팅 한 줄 글자색 (rgb) */
async function lineColor(page, text) {
    const row = chatLog(page).getByRole('listitem').filter({ hasText: text }).first();
    await expect(row).toBeVisible();
    return row.locator('span').last().evaluate((el) => getComputedStyle(el).color);
}

const deadBadge = (page) => page.getByText('죽은 사람끼리', { exact: true });

/** 판 차리고 사람 모두 역할 공개 창 닫기 → Table */
async function startGame(table, { humans, bots = 3, roles = null, settings = {} }) {
    const t = await table.setup({ humans, bots, roles, settings });
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page)));
    return t;
}

const isDead = (s, uuid) => s.players.find((p) => p.uuid === uuid)?.alive === false;

/** 봇 행동 다시 정하기 (앞 계획 멈추고 새로) */
async function replan(t, plan) {
    await t.stopBots();
    t.playBots(plan);
}

/**
 * 봇들이 낮 투표·재판으로 target을 처형 → 죽을 때까지 (밤엔 아무도 안 죽임)
 * extra: 봇 계획에 더할 것 (deadChat 등)
 */
async function executeByBots(t, targetUuid, extra = {}) {
    await replan(t, (bot) => ({
        dayVote: bot.account.uuid === targetUuid ? 'abstain' : targetUuid,
        tribunal: 'GUILTY',
        night: 'skip',
        pollMs: 200,
        ...(typeof extra === 'function' ? extra(bot) : extra),
    }));
    return t.advanceUntil((s) => isDead(s, targetUuid), { stepDelayMs: 900, maxSteps: 30 });
}

/** 광대 봇(jokerIndex)이 밤에 target을 죽임 (낮 투표는 모두 기권) → 죽을 때까지 */
async function killAtNight(t, targetUuid, { jokerIndex = 0, extra = {} } = {}) {
    await replan(t, (bot, i) => ({
        dayVote: 'abstain',
        tribunal: 'skip',
        night: i === jokerIndex ? targetUuid : 'skip',
        pollMs: 200,
        ...(typeof extra === 'function' ? extra(bot, i) : extra),
    }));
    return t.advanceUntil((s) => isDead(s, targetUuid), { stepDelayMs: 900, maxSteps: 30 });
}

/** 봇 아무 행동 없이 단계만 넘겨 그 단계까지 */
async function phaseTo(t, phase) {
    return t.advanceUntil(phase, { stepDelayMs: 500 });
}

/** 봇이 채팅 보내기 (낮·죽은 사람 채널은 서버가 정함) → 응답 */
function botSay(t, botIndex, text) {
    return t.bots[botIndex].request('submit_game_chat_message', { gameId: t.gameId, text });
}
/** 봇 밤 같은 직업 채팅 → 응답 */
function botNightSay(t, botIndex, text) {
    return t.bots[botIndex].request('submit_joker_chat_message', { gameId: t.gameId, text });
}
/** 봇이 받은 채팅 사건에 그 글이 있는지 */
function botGot(t, botIndex, event, text) {
    return t.bots[botIndex].events.some((r) => r.event === event && r.payload?.text === text);
}

const rand = () => Math.random().toString(36).slice(2, 7);
/** 시험마다 다른 글 (다른 시험 채팅과 안 섞이게) */
const uniq = (prefix) => `${prefix}${rand()}`;

/** 금지어 넣고 다시 읽기 (한글+숫자로 닉네임에 안 걸림) → 단어, 끝나면 removeBannedWord */
async function addBannedWord(word = `금칙${Math.floor(Math.random() * 1e8)}`) {
    await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [word]);
    await internal.reloadBannedWords();
    return word;
}
async function removeBannedWord(word) {
    await db.query('DELETE FROM banned_words WHERE word = ?', [word]);
    await internal.reloadBannedWords();
}

/** 화면 소켓 글 엿보기: page.on('websocket') → 받은 socket.io 사건 [{event,payload}] (붙인 뒤 생긴 소켓만) */
function watchSocket(page) {
    const events = [];
    page.on('websocket', (ws) => {
        ws.on('framereceived', (frame) => {
            const raw = String(frame.payload);
            const m = raw.match(/^42(\[.*)$/s);
            if (!m) return;
            try {
                const [event, payload] = JSON.parse(m[1]);
                events.push({ event, payload, at: Date.now() });
            } catch { /* 모양 다름 */ }
        });
    });
    return events;
}

/** 화면들이 밤(또는 낮) 단계 글까지 따라왔는지 + 채팅 칸 열림 (단계 바뀐 직후 다른 사람 화면이 늦게 따라오는 것 기다림) */
async function phaseReady(pages, label = /\[밤-/) {
    for (const page of pages) {
        await readyToChat(page);
        await expect(page.getByText(label).first()).toBeVisible({ timeout: 15000 });
    }
}

/** 다른 사람 카드(닉네임으로 시작하는 버튼) */
const card = (page, nickname) => page.getByRole('button', { name: new RegExp(`^(사망 )?${nickname}`) });
const selfCard = (page, nickname) => page.getByRole('button', { name: new RegExp(`^(사망 )?본인 ${nickname}`) });

module.exports = {
    CONFIRM_DIALOGS, dismissOverlays, readyToChat, chatBox, chatLog, sendButton, line, say, expectLine, expectNoText,
    lineChannel, lineColor, deadBadge, startGame, isDead, replan, executeByBots, killAtNight, phaseTo,
    botSay, botNightSay, botGot, uniq, addBannedWord, removeBannedWord, watchSocket, card, selfCard, sleep, phaseReady,
};
