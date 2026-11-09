'use strict';

// 인게임 A(낮·투표·재판) 시험 공용 손잡이 파일, 판 차리기·단계 넘기기·봇 표 내기를 기다림 없이 정확하게
// 봇 행동은 playBots(뒤에서 도는 것) 대신 소켓 요청을 하나씩 보내고 답을 기다림 → 단계 넘기기와 엇갈리지 않음
const { expect } = require('../../../helpers/fixtures');
const db = require('../../../helpers/db');
const { internal } = require('../../../helpers/internal');
const { sleep } = require('../../../helpers/bots');

// 역할 직접 구성 (작은 판에서도 의사·경비원·마녀사냥꾼 넣기), 광대 수는 jokerCount와 같아야 함
const customRoles = ({ JOKER = 1, DOCTOR = 0, GUARD = 0, WITCH_HUNTER = 0 } = {}) => ({
    jokerCount: JOKER,
    roleCompositionMode: 'custom',
    roleCounts: { JOKER, DOCTOR, GUARD, WITCH_HUNTER },
});

/** 판 요약을 조건 맞을 때까지 기다림 (단계를 넘기지 않음) */
async function waitState(t, match, { timeout = 20000, message = '판 상태 기다림' } = {}) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last ? match(last) : false; }, { timeout, message }).toBe(true);
    return last;
}

/** 단계 전환 안내 창(낮이 되었습니다·밤이 되었습니다) 뜰 때까지 → 확인 눌러 닫음 */
async function closeNotice(page, text) {
    const dialog = page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    if (text) await expect(dialog).toContainText(text);
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toBeHidden();
}

/** 내가 죽으면 뜨는 '사망 후 선택' 창에서 관전 계속하기 */
async function keepWatching(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await dialog.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(dialog).toBeHidden();
}

/** 역할 공개 창 확인 누르기 (창이 뜬 걸 보고 나서 단계를 넘겨야 창이 10초 동안 남지 않음) */
async function closeReveal(page) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toBeHidden();
}

/** 역할 공개 → 제 1일 낮 토론까지, 사람마다 역할 창·낮 안내 닫기 */
async function toDay(t, { closeNotices = true } = {}) {
    for (const h of t.humans) await closeReveal(h.page);
    await t.advanceUntil('DAY');
    if (closeNotices) for (const h of t.humans) await closeNotice(h.page, '낮이 되었습니다');
}

/** 낮 토론 → 낮 투표 (단계 넘기기 한 번), 사람 화면에 기권 버튼까지 */
async function toVote(t) {
    const s = await t.state();
    if (s.phase !== 'DAY' || s.dayPhase !== 'DAY_DISCUSSION') throw new Error(`토론 단계가 아님: ${s.phase}/${s.dayPhase}`);
    await t.advance();
    await waitState(t, (g) => g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE');
    for (const h of t.humans) await expect(h.page.getByRole('button', { name: '기권' })).toBeVisible();
}

/** 봇 하나 낮 표 (uuid 또는 null = 기권) → 답 */
async function botVote(t, bot, targetId) {
    return bot.request('cast_day_vote', { gameId: t.gameId, targetId });
}

/** 봇 여러 개 낮 표: [[bot, target], ...] 또는 모든 봇 같은 대상 */
async function botsVote(t, pairsOrTarget, bots = t.bots) {
    const pairs = Array.isArray(pairsOrTarget) ? pairsOrTarget : bots.map((b) => [b, pairsOrTarget]);
    for (const [bot, target] of pairs) {
        const r = await botVote(t, bot, target);
        if (!r?.ok) throw new Error(`봇 낮 표 실패: ${r?.code}`);
    }
}

/** 낮 투표 마감 (안 낸 사람은 기권) → 낮을 벗어난 판 요약 */
async function resolveVote(t) {
    await t.advance();
    return waitState(t, (g) => g.phase !== 'DAY');
}

/** 봇 재판 표 */
async function botTribunal(t, bot, vote) {
    const s = await t.state();
    return bot.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: s.dayIndex, vote });
}

async function botsTribunal(t, pairsOrVote, bots = t.bots) {
    const pairs = Array.isArray(pairsOrVote) ? pairsOrVote : bots.map((b) => [b, pairsOrVote]);
    for (const [bot, vote] of pairs) {
        const r = await botTribunal(t, bot, vote);
        if (!r?.ok) throw new Error(`봇 재판 표 실패: ${r?.code}`);
    }
}

/** 재판 마감 (안 낸 사람은 기권) → 재판을 벗어난 판 요약 */
async function resolveTribunal(t) {
    await t.advance();
    return waitState(t, (g) => g.phase !== 'TRIBUNAL');
}

/** 판 요약에서 사람 찾기 */
const playerOf = (s, uuid) => s.players.find((p) => p.uuid === uuid);
const nickOf = (t, botOrHuman) => botOrHuman.nickname ?? botOrHuman.account.nickname;
const uuidOf = (x) => x.account.uuid;

/** 보드 카드 (남은 닉네임 그대로, 나는 '본인 닉네임') */
// 죽은 사람 카드 이름은 "사망 닉네임", 끊긴 사람은 "연결 끊김 닉네임" (닉네임은 영문·숫자라 그대로 정규식에 넣음)
const card = (page, nickname) => page.getByRole('button', { name: new RegExp(`^(사망 |연결 끊김 )?${nickname}$`) });
const selfCard = (page, nickname) => page.getByRole('button', { name: new RegExp(`^(사망 |연결 끊김 )?본인 ${nickname}$`) });

/** 카드 눌러 메뉴 항목 누르기 (투표하기·투표취소·유죄·무죄) */
async function cardAction(page, nickname, item) {
    await card(page, nickname).click();
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: item }).click();
    await expect(menu).toBeHidden();
}

/** 화면으로 낮 투표 → 기권 버튼이 잠기면 보낸 것 */
async function voteUi(page, nickname) {
    await cardAction(page, nickname, '투표하기');
    await expect(page.getByRole('button', { name: '기권' })).toBeDisabled();
}

/** 투표 현황 창 열어서 칸 값 읽기 → { votes, abstain, outcome, target } */
async function readVoteStatus(page) {
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(dialog).toBeVisible();
    return dialog;
}

/** 채팅 보내고 입력칸 비워질 때까지 (서버 답 받음) */
async function sendChatOk(page, text, { scope = page } = {}) {
    const input = scope.getByRole('textbox', { name: '채팅 입력' });
    await input.fill(text);
    await scope.getByRole('button', { name: '채팅 보내기' }).click();
    await expect(input).toHaveValue('');
}

/** 채팅 내역 줄 (닉네임: "글") */
const chatLog = (scope) => scope.getByRole('log', { name: '채팅 내역' });

/** 봇 채팅 */
async function botChat(t, bot, text) {
    return bot.request('submit_game_chat_message', { gameId: t.gameId, text });
}

/** 금지어 넣기 (시험마다 무작위, 다른 시험 글에 안 걸리게) → 지우기 함수 */
const randomWord = (n = 6) => Array.from({ length: n }, () => 'qwxzjvk'[Math.floor(Math.random() * 7)]).join('');
async function addBannedWords(words) {
    for (const w of words) {
        await db.query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [w]);
    }
    await internal.reloadBannedWords();
    return async () => {
        for (const w of words) await db.query('DELETE FROM banned_words WHERE word = ?', [w]);
        await internal.reloadBannedWords();
    };
}

/** 화면 타이머 남은 초 */
async function timerSeconds(page) {
    const text = await page.getByRole('timer').first().innerText();
    const m = text.match(/(\d+):(\d+)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

module.exports = {
    customRoles, waitState, closeNotice, keepWatching, closeReveal, toDay, toVote, botVote, botsVote, resolveVote,
    botTribunal, botsTribunal, resolveTribunal, playerOf, nickOf, uuidOf, card, selfCard, cardAction, voteUi,
    readVoteStatus, sendChatOk, chatLog, botChat, addBannedWords, randomWord, timerSeconds, sleep,
};
