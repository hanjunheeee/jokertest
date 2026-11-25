'use strict';

// 모바일 채팅방 표(브라우저): 단계 4 × 나 5 칸마다 "죽은 사람끼리" 띠, 글을 받은 봇을 폰 세로 카톡형에서 확인 (모바일 상대 화면엔 밤 띠·밤 시민 닫힘 없음 → 밤 시민은 보내도 봇 0)
// 목록 A06-E-113~130 (값 18, PC 표 A06-E-001~018과 같은 판) — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a06-talk-matrix.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const day = require('../ingame/a-day/_lib');
const m = require('./_talk');

const { talk } = m;

// 단계 시간을 길게 둠: 단계는 손잡이로 넘기고, 확인하는 동안 진짜 마감이 끼어들지 않게 (이 파일은 마감 시간을 안 봄)
const SLOW = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const DAY_EVT = 'day_chat_message_received';
const DEAD_EVT = 'dead_chat_message_received';
const ROLE_EVT = 'joker_chat_message';
const ROLE_NAME = ui.ROLE_LABELS;

// 산 사람 칸: 7명 판 직접 구성 광대 2·의사 2·시민 3 — 봇 자리 직업 (맨 끝 봇은 늘 시민 = 재판 피고)
const ALIVE_COUNTS = { JOKER: 2, DOCTOR: 2 };
const ALIVE_BOTS = {
    CITIZEN: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
    JOKER: ['JOKER', 'DOCTOR', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    DOCTOR: ['JOKER', 'JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
};
// 죽은 사람 칸: 8명 판 직접 구성 광대 2 — 맨 끝 봇(시민)은 첫 밤에 죽어 "죽은 봇", 그 앞 봇(시민)은 둘째 날 피고
const DEAD_COUNTS = { JOKER: 2 };
const DEAD_BOTS = {
    CITIZEN: ['JOKER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    JOKER: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
};

// 표 한 칸 = 시험 하나 (역할 확인 × 죽은 사람 2칸은 없음: 역할 확인 때는 아무도 안 죽음)
const CELLS = [
    { id: 'A06-E-113', phase: 'REVEAL', me: 'CITIZEN', dead: false },
    { id: 'A06-E-114', phase: 'REVEAL', me: 'JOKER', dead: false },
    { id: 'A06-E-115', phase: 'REVEAL', me: 'DOCTOR', dead: false },
    { id: 'A06-E-116', phase: 'DAY', me: 'CITIZEN', dead: false, smoke: true },
    { id: 'A06-E-117', phase: 'DAY', me: 'JOKER', dead: false },
    { id: 'A06-E-118', phase: 'DAY', me: 'DOCTOR', dead: false },
    { id: 'A06-E-119', phase: 'DAY', me: 'CITIZEN', dead: true },
    { id: 'A06-E-120', phase: 'DAY', me: 'JOKER', dead: true },
    { id: 'A06-E-121', phase: 'TRIBUNAL', me: 'CITIZEN', dead: false },
    { id: 'A06-E-122', phase: 'TRIBUNAL', me: 'JOKER', dead: false },
    { id: 'A06-E-123', phase: 'TRIBUNAL', me: 'DOCTOR', dead: false },
    { id: 'A06-E-124', phase: 'TRIBUNAL', me: 'CITIZEN', dead: true },
    { id: 'A06-E-125', phase: 'TRIBUNAL', me: 'JOKER', dead: true },
    { id: 'A06-E-126', phase: 'NIGHT', me: 'CITIZEN', dead: false },
    { id: 'A06-E-127', phase: 'NIGHT', me: 'JOKER', dead: false },
    { id: 'A06-E-128', phase: 'NIGHT', me: 'DOCTOR', dead: false },
    { id: 'A06-E-129', phase: 'NIGHT', me: 'CITIZEN', dead: true },
    { id: 'A06-E-130', phase: 'NIGHT', me: 'JOKER', dead: true },
];

const PHASE_NAME = { REVEAL: '역할 확인', DAY: '낮', TRIBUNAL: '재판', NIGHT: '밤' };

// 시험마다 다른 글 (다른 시험 채팅과 안 섞이게)
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;

// 봇이 받은 알림 보기: 그 글이 어떤 알림으로든 왔는지 / 그 알림으로 올 때까지 기다림
const heardAny = (bot, text) => bot.events.some((r) => r.payload?.text === text);
const hears = (bot, event, text) => bot.waitForEvent(event, { match: (p) => p?.text === text });
// 앞서 보낸 알림이 봇에 다 닿았는지: 같은 소켓으로 묻고 답을 받음 (소켓 하나 안에서는 순서가 지켜져 고정 쉬기 없이 "안 옴"을 봄)
const settle = (t, bots = t.bots) => Promise.all(bots.map((b) => b.snapshot(t.gameId)));

const tribunalChat = (page) => page.getByRole('region', { name: '최후의 반론 채팅' });

/** 조건에 맞는 봇만 (서버 판 값 기준) → 예: 산 광대 봇 */
async function pick(t, match) {
    const s = await t.state();
    return t.bots.filter((b) => match(s.players.find((p) => p.uuid === b.account.uuid)));
}

/** 판 차리기: 사람 1 + 봇, 직업을 전부 정하고 서버 값으로 한 번 확인 → 역할 확인 창 닫음 */
async function seat(table, user, { role, botRoles, counts }) {
    const t = await table.setup({
        humans: [user],
        bots: botRoles.length,
        settings: customRoleSettings(counts, SLOW),
        roles: ({ bots }) => ({
            [user.account.uuid]: role,
            ...Object.fromEntries(bots.map((b, i) => [b.account.uuid, botRoles[i]])),
        }),
    });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    expect(roleOf(user.account.uuid), '사람 직업').toBe(role);
    t.bots.forEach((b, i) => expect(roleOf(b.account.uuid), `봇 ${i} 직업`).toBe(botRoles[i]));
    await ui.readRoleReveal(user.page);
    return t;
}

/** 연출·안내 창을 닫아 가며 입력 줄을 쓸 수 있을 때까지 (밤 암살 영상이 멈춰 있으면 그 창의 단추) */
async function ready(page) {
    await expect(async () => {
        const stuck = page.locator('[data-ingame-night-success-kill] button').first();
        if (await stuck.isVisible().catch(() => false)) await stuck.click({ timeout: 1000 }).catch(() => {});
        await m.clearOverlays(page);
        expect(await talk.input(page).evaluate((el) => !el.closest('[inert]'), null, { timeout: 1000 })).toBe(true);
    }).toPass({ timeout: 40000 });
}

/** 늦게 뜬 안내 창이 가릴 수 있음 → 창을 닫아 가며 진짜 읽히는지 */
async function readableOnScreen(page, locator) {
    await expect(async () => {
        await m.clearOverlays(page);
        await expectReadable(locator, { timeout: 1500 });
    }).toPass({ timeout: 45000 });
}

/** 채팅방에서 말하기 (입력 줄이 풀린 뒤) */
async function say(page, text) {
    await ready(page);
    await m.say(page, text);
}

/** 봇 표로 한 사람을 재판에 세움 (사람은 안 내서 기권으로 셈) → 표 낸 봇들 */
async function toTribunal(t, defendantUuid) {
    await t.assertBotsCanExecute(defendantUuid);
    await t.advanceUntil('DAY_VOTE');
    const voters = await pick(t, (p) => p.alive && p.uuid !== defendantUuid);
    await day.botsVote(t, defendantUuid, voters);
    const s = await day.resolveVote(t);
    expect(s.phase, '봇 표로 재판이 열려야 함').toBe('TRIBUNAL');
    return voters;
}

/** 봇 표로 한 사람을 처형 (낮 투표 → 재판 유죄) */
async function execute(t, uuid) {
    const voters = await toTribunal(t, uuid);
    await day.botsTribunal(t, 'GUILTY', voters);
    await day.resolveTribunal(t);
    await day.waitState(t, (s) => s.players.find((p) => p.uuid === uuid)?.alive === false);
}

/** 처형된 내 화면: 연출 뒤에 뜨는 "사망 후 선택"에서 관전 계속하기 (앞 연출이 창을 잠깐 가려 여러 번 봄) */
async function keepWatching(page) {
    const dialog = talk.deadChoice(page);
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(async () => {
        await m.clearOverlays(page, { keepWatching: false });
        if (await dialog.isVisible()) await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 });
        await expect(dialog).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 45000 });
}

/** 광대 봇들이 밤에 한 사람을 죽임: 광대 차례까지 → 직접 지목 → 그 사람이 죽을 때까지 (낮이 됨) */
async function killAtNight(t, victimUuid) {
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER');
    for (const joker of await pick(t, (p) => p.role === 'JOKER' && p.alive)) {
        const reply = await joker.request('submit_night_action', { gameId: t.gameId, targetId: victimUuid });
        expect(reply?.ok, `광대 봇 지목 답 ${reply?.code}`).toBe(true);
    }
    await t.advanceUntil((s) => s.players.find((p) => p.uuid === victimUuid)?.alive === false);
}

/** 산 사람 판 (7명) */
function aliveGame(table, user, role) {
    return seat(table, user, { role, botRoles: ALIVE_BOTS[role], counts: ALIVE_COUNTS });
}

/**
 * 죽은 사람 판 (8명): 1일 재판으로 내가 처형 → 첫 밤 광대 봇이 맨 끝 봇을 죽임 → 둘째 낮 (죽은 사람 = 나 + 봇 하나)
 * @returns {Promise<{ t:any, deadBot:any }>}
 */
async function deadGame(table, user, role) {
    const t = await seat(table, user, { role, botRoles: DEAD_BOTS[role], counts: DEAD_COUNTS });
    const deadBot = t.bots[t.bots.length - 1];
    await execute(t, user.account.uuid);
    await keepWatching(user.page);
    await killAtNight(t, deadBot.account.uuid);
    await expect.poll(async () => (await t.state())?.dayIndex, { timeout: 20000, message: '서버 날짜 제 2일' }).toBe(2);
    await expect(talk.phaseLine(user.page)).toContainText('낮', { timeout: 20000 });
    await ready(user.page);
    return { t, deadBot };
}

/** 죽은 내 글: 죽은 봇은 받고 산 봇은 아무 알림으로도 못 받음 */
async function expectDeadOnly(t, deadBot, text) {
    await hears(deadBot, DEAD_EVT, text);
    const alive = await pick(t, (p) => p.alive);
    await settle(t, alive);
    for (const b of alive) expect(heardAny(b, text), `산 봇 ${b.nickname}이 죽은 사람 글을 받음`).toBe(false);
}

// 역할 확인 칸: 입장 준비 덮개가 화면을 덮음, 글을 치고 엔터를 쳐도 봇 0
// 모바일(상대 화면)은 입력 줄을 끄지 않고 덮개(frontend-mobile overlays/EntryPreparingOverlay.jsx)로 막음
async function revealCell({ user, table }, cell) {
    const t = await aliveGame(table, user, cell.me);
    const page = user.page;
    const text = uniq('확인중');
    const input = talk.input(page);
    await expect(page.locator('[data-ingame-entry-preparing]'), '역할 확인 중 입장 준비 덮개').toBeVisible({ timeout: 3000 });
    // 그래도 덮개 너머로 억지로 쳐 봄 (막혀도 기다리지 않게 짧게)
    await input.fill(text, { force: true, timeout: 1000 }).catch(() => {});
    await input.press('Enter', { timeout: 1000 }).catch(() => {});
    // 역할 확인 10초는 손잡이로 안 넘김 → 엔터를 친 때가 아직 그 10초 안이어야 이 칸을 본 것
    expect((await t.state()).phase).toBe('ROLE_REVEAL');

    // 첫 낮에 표지 글을 보내 봇이 받게 함: 내 소켓에서 표지보다 먼저 나간 글이 있었다면 봇에 이미 와 있음
    await m.toDay(t, page);
    const mark = uniq('표지');
    await say(page, mark);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, mark)));
    for (const b of t.bots) expect(heardAny(b, text), `봇 ${b.nickname}이 역할 확인 중 글을 받음`).toBe(false);
    await expect(talk.log(page)).not.toContainText(text);
}

// 낮 칸
async function dayCell({ user, table }, cell) {
    if (cell.dead) {
        const { t, deadBot } = await deadGame(table, user, cell.me);
        const page = user.page;
        await readableOnScreen(page, talk.deadBanner(page));
        const text = uniq('죽은낮말');
        await say(page, text);
        await expectDeadOnly(t, deadBot, text);
        return;
    }
    const t = await aliveGame(table, user, cell.me);
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);
    await expect(talk.deadBanner(page)).toHaveCount(0);
    const text = uniq('낮말');
    await say(page, text);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, text)));
}

// 재판 칸: 합친 뒤 세로 카톡형은 재판 창 안 채팅 칸이 없음 → 고발 연출 뒤 채팅방·바닥 입력 줄 그대로 말함 (frontend-mobile talk/TalkLayout.jsx)
// 규칙은 같게 봄: 산 사람 글은 봇 전원이, 죽은 사람 글은 죽은 봇만 받음, "죽은 사람끼리" 띠는 죽은 사람 채팅방에만
async function tribunalCell({ user, table }, cell) {
    if (cell.dead) {
        const { t, deadBot } = await deadGame(table, user, cell.me);
        const page = user.page;
        // 재판 앞(둘째 낮) 채팅방엔 "죽은 사람끼리" 띠가 읽힘
        await readableOnScreen(page, talk.deadBanner(page));
        await toTribunal(t, t.bots[t.bots.length - 2].account.uuid);
        await m.waitTrialTalk(page);
        await expect(tribunalChat(page)).toHaveCount(0);
        await expect(page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(1);
        const text = uniq('죽은반론');
        await say(page, text);
        await expectDeadOnly(t, deadBot, text);
        // 재판 중 채팅방에도 "죽은 사람끼리" 띠 1개가 읽힘 (결정 2026-11-16 낮 넷째 4번)
        const banner = talk.chat(page).locator('[data-dead-chat-banner]');
        await expect(banner).toHaveCount(1);
        await expect(banner).toHaveText('죽은 사람끼리');
        await readableOnScreen(page, banner);
        return;
    }
    const t = await aliveGame(table, user, cell.me);
    const page = user.page;
    await m.toDay(t, page);
    await ready(page);
    await toTribunal(t, t.bots[t.bots.length - 1].account.uuid);
    await m.waitTrialTalk(page);
    // 옛 재판 창 채팅 칸은 없고 입력칸은 채팅방 바닥 것 하나
    await expect(tribunalChat(page)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(1);
    // 산 사람 채팅방엔 재판 중에도 "죽은 사람끼리" 띠 없음
    await expect(talk.chat(page).locator('[data-dead-chat-banner]')).toHaveCount(0);
    const text = uniq('반론');
    await say(page, text);
    await Promise.all(t.bots.map((b) => hears(b, DAY_EVT, text)));
}

// 밤 칸
async function nightCell({ user, table }, cell) {
    if (cell.dead) {
        const { t, deadBot } = await deadGame(table, user, cell.me);
        const page = user.page;
        await m.toNight(t, page);
        await ready(page);
        await readableOnScreen(page, talk.deadBanner(page));
        const text = uniq('죽은밤말');
        await say(page, text);
        await expectDeadOnly(t, deadBot, text);
        return;
    }
    const t = await aliveGame(table, user, cell.me);
    const page = user.page;
    await m.toNight(t, page);
    if (cell.me === 'CITIZEN') {
        // 모바일(상대 화면)은 밤 시민 입력 줄을 닫지 않음 → 쳐서 보내도 어느 봇에게도 안 감
        await ready(page);
        const text = uniq('밤시민');
        await talk.input(page).fill(text);
        await talk.input(page).press('Enter');
        await m.sleep(1000);
        await settle(t);
        for (const b of t.bots) expect(heardAny(b, text), `봇 ${b.nickname}이 밤 시민 글을 받음`).toBe(false);
        return;
    }
    await ready(page);
    await expect(talk.deadBanner(page)).toHaveCount(0);
    const text = uniq('밤말');
    await say(page, text);
    const mates = await pick(t, (p) => p.role === cell.me);
    const others = await pick(t, (p) => p.role !== cell.me);
    expect(mates.length).toBeGreaterThan(0);
    await Promise.all(mates.map((b) => hears(b, ROLE_EVT, text)));
    await settle(t, others);
    for (const b of others) expect(heardAny(b, text), `다른 직업 봇 ${b.nickname}이 받음`).toBe(false);
}

const RUN = { REVEAL: revealCell, DAY: dayCell, TRIBUNAL: tribunalCell, NIGHT: nightCell };

// 칸마다 기대 한 줄 (시험 이름에 붙임)
function expectation(cell) {
    if (cell.phase === 'REVEAL') return '입장 준비 덮개·엔터를 쳐도 봇 0';
    if (cell.dead && cell.phase === 'TRIBUNAL') return '재판 앞·재판 중 채팅방에 "죽은 사람끼리" 띠가 읽히고 바닥 입력 줄로 보내면 죽은 봇만 받음';
    if (cell.dead) return '"죽은 사람끼리" 띠가 읽히고 죽은 봇만 받음';
    if (cell.phase === 'NIGHT' && cell.me === 'CITIZEN') return '보내도 봇 0';
    if (cell.phase === 'NIGHT') return '같은 직업 봇만 받음';
    if (cell.phase === 'TRIBUNAL') return '재판 중 채팅방에 "죽은 사람끼리" 띠 없고 바닥 입력 줄로 보내면 봇 전원이 받음';
    return '"죽은 사람끼리" 띠 없이 보내면 봇 전원이 받음';
}

for (const cell of CELLS) {
    const who = `${cell.dead ? '죽은' : '산'} ${ROLE_NAME[cell.me]}`;
    const size = cell.dead ? '8명 판 광대 2' : '7명 판 광대 2·의사 2';
    const tags = cell.smoke ? '@game @smoke' : '@game';
    test(`${cell.id} 채팅방 표 ${PHASE_NAME[cell.phase]} × ${who} (${size}): ${expectation(cell)} ${tags}`, async ({ user, table }) => {
        // 죽은 사람 칸은 처형·밤 암살·둘째 날까지 가서 김 → 이 시험만 늘림
        if (cell.dead) test.setTimeout(240_000);
        await RUN[cell.phase]({ user, table }, cell);
    });
}
