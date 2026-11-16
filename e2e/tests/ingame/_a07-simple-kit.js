'use strict';

// A07(승패·결과·판 골드) PC·관리자 브라우저 시험이 같이 쓰는 도우미 — 직업 맞춘 판 열기·봇 표로 처형·밤 암살·나가기·끊김, 결과판 찾기, 판 골드 장부·지갑 읽기, 관리자 값 바꾸기
// ingame/a07-*.spec.js·admin/a07-*.spec.js(목록 A07 브라우저 간단 PC 몫)가 씀, 이름이 .spec.js가 아니라 시험으로 안 셈
const crypto = require('node:crypto');
const { expect, E2E } = require('../../helpers/fixtures');
const { query, sqlTime } = require('../../helpers/db');
const admins = require('../../helpers/adminAccounts');
const store = require('../store/store-tools');
const n = require('./b-night/_night');
const day = require('./a-day/_lib');

// 이긴 진영 띠 글 (화면 gameResultLabels.js)
const WIN_TEXT = Object.freeze({ CITIZEN: '시민 진영 승리', JOKER: '광대 진영 승리' });
// 결과판 직업 글 — 의사는 결정(2026-11-16 아침 19번 "의사로 통일")대로, 지금 화면 글은 "주치의"
const JOB_TEXT = Object.freeze({ JOKER: '광대', CITIZEN: '귀족', DOCTOR: '의사', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' });
// 단계가 저절로 안 넘어가게 가장 긴 시간으로 (단계는 손잡이로만 넘김 — 화면을 보는 동안 진짜 마감이 오면 흐름이 엇갈림)
const LONG_TIMES = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

const uid = (who) => who.account.uuid;
const nick = (who) => who.nickname ?? who.account.nickname;
// 시민 k명 줄 → 예: C(3) → ['CITIZEN', 'CITIZEN', 'CITIZEN']
const C = (k) => Array(k).fill('CITIZEN');

// 직업 줄 → 방 설정(직접 구성) → 예: ['CITIZEN', 'JOKER', 'DOCTOR'] → 광대 1·의사 1·나머지 0
function settingsOf(roles) {
    const count = (role) => roles.filter((r) => r === role).length;
    return n.custom({ JOKER: count('JOKER'), DOCTOR: count('DOCTOR'), GUARD: count('GUARD'), WITCH_HUNTER: count('WITCH_HUNTER') });
}

/** 역할 확인 창: 떠 있으면 확인 눌러 닫음, 10초가 지나 이미 닫혔으면 그냥 지나감 */
async function closeReveal(page) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    await dialog.getByRole('button', { name: '확인' }).click({ timeout: 8000 }).catch(() => {});
    await expect(dialog).toBeHidden({ timeout: 12_000 });
}

/**
 * 판 열고 첫 낮까지: 사람 1명(me 직업) + 봇(botRoles 순서대로 t.bots가 줄 섬), 직업은 전원 정해 줌
 * 봇은 스스로 아무것도 안 함 (표·밤 행동은 시험이 시킬 때만) → 단계는 시험이 넘길 때만 넘어감
 * auto면 "낮이·밤이 되었습니다" 창과 낮 시작 글 창의 확인을 화면 기록이 바로 눌러 줌 (그 창을 볼 시험은 auto: false)
 * keepUser면 직업을 못 맞춰 사람이 새 계정으로 바뀐 때 던짐 (판 전에 그 계정으로 읽어 둔 값이 있는 시험)
 * @param {*} table fixtures의 table
 * @param {*} user fixtures의 user
 * @param {string} me 사람 직업
 * @param {string[]} botRoles 봇 직업 줄 (판 인원 = 1 + 길이)
 * @param {{ settings?:object, auto?:boolean, keepUser?:boolean }} [o]
 * @returns {Promise<{ t:any, page:import('@playwright/test').Page }>}
 */
async function open(table, user, me, botRoles, { settings = {}, auto = true, keepUser = false } = {}) {
    const before = uid(user);
    const t = await n.setup(table, {
        humans: [user], bots: botRoles.length, settings: { ...LONG_TIMES, ...settingsOf([me, ...botRoles]), ...settings }, humanRoles: [me], botRoles,
    });
    if (keepUser && uid(user) !== before) throw new Error('사람 계정이 새로 바뀜 → 판 전에 읽어 둔 값과 안 맞음 (다시 돌리기)');
    const s = await t.state();
    expect(s.players, '판 인원').toHaveLength(botRoles.length + 1);
    expect(n.rowOf(s, uid(user))?.role, '사람 직업이 정한 대로').toBe(me);
    botRoles.forEach((role, i) => expect(n.rowOf(s, uid(t.bots[i]))?.role, `봇 ${i} 직업이 정한 대로`).toBe(role));
    const page = user.page;
    await closeReveal(page);
    if (auto) await n.recordUi(page, { autoConfirm: true, autoConfirmDawn: true });
    await t.advanceUntil('DAY');
    if (!auto) await day.closeNotice(page, '낮이 되었습니다');
    return { t, page };
}

/** 살아서 판에 남은 봇 (판 요약 기준) */
async function aliveBots(t) {
    const s = await t.state();
    const alive = new Set(s.players.filter((p) => p.alive && p.isParticipating !== false).map((p) => p.uuid));
    return t.bots.filter((b) => alive.has(uid(b)));
}

/** 봇 요청 하나 (서버가 받아야 함) → 답 */
async function ask(t, bot, event, payload = {}) {
    const reply = await bot.request(event, { gameId: t.gameId, ...payload });
    expect(reply?.ok, `봇 ${event}를 서버가 받음 (거절 코드: ${reply?.code})`).toBe(true);
    return reply;
}

/**
 * 봇 표로 재판 열기 (낮 토론에서 부름): 투표 단계로 넘김 → 봇들이 victim을 찍음 → 마감 → 재판 단계
 * 사람과 victim은 안 냄 (마감 때 기권) — 최다 득표가 기권보다 많아야 재판이라 voters 수는 시험이 맞춤
 * @param {string} victim 피고 uuid
 * @param {any[]} [voters] 찍을 봇 (안 주면 살아 있는 봇 전부, victim 빼고)
 * @returns {Promise<any[]>} 표를 낸 봇들 (재판 표도 이 봇들이 냄)
 */
async function toTribunal(t, victim, voters = null) {
    const list = (voters ?? await aliveBots(t)).filter((b) => uid(b) !== victim);
    await t.advance();
    await day.waitState(t, (g) => g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE');
    for (const bot of list) await ask(t, bot, 'cast_day_vote', { targetId: victim });
    await t.advance();
    const s = await day.waitState(t, (g) => g.phase !== 'DAY');
    expect({ phase: s.phase, defendant: s.tribunal?.defendantUuid ?? null }, '재판이 그 사람으로 열림').toEqual({ phase: 'TRIBUNAL', defendant: victim });
    return list;
}

/** 재판 판결: 봇들이 같은 표 → 마감 → 재판을 벗어난 판 요약 (사람은 안 냄) */
async function verdict(t, voters, vote = 'GUILTY') {
    const { dayIndex } = await t.state();
    for (const bot of voters) await ask(t, bot, 'cast_tribunal_vote', { dayIndex, vote });
    await t.advance();
    return day.waitState(t, (g) => g.phase !== 'TRIBUNAL');
}

/** 처형 한 번 (재판 + 유죄) → 재판 뒤 판 요약 (판이 안 끝났으면 그날 밤) */
async function execute(t, victim, voters = null) {
    return verdict(t, await toTribunal(t, victim, voters));
}

/**
 * 밤 한 번: 광대 차례까지 넘김(낮에서 부르면 재판 없이 밤으로) → 광대 봇들이 victim을 고름 → 나머지 차례는 마감으로 넘김
 * @param {any[]} jokers 고를 광대 봇 (광대가 둘이면 둘 다 — 같은 사람을 골라야 죽음), 빈 배열이면 아무도 안 고름
 * @param {string|null} victim 고를 사람 uuid
 * @param {{ save?: any }} [o] save = 그 사람을 보호할 의사 봇
 * @returns 밤을 벗어난 판 요약 (다음 날 낮 또는 판 끝)
 */
async function nightKill(t, jokers, victim, { save = null } = {}) {
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER');
    for (const bot of jokers) await ask(t, bot, 'submit_night_action', { targetId: victim });
    if (save) {
        await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'DOCTOR');
        await ask(t, save, 'submit_night_action', { targetId: victim });
    }
    return t.advanceUntil((s) => s.phase !== 'NIGHT');
}

/** 봇이 판에서 나감 (산 채로면 탈주, 죽은 뒤면 그냥 빠짐) */
const leave = (t, bot) => ask(t, bot, 'leave_game_session');

/** 봇 소켓을 끊고 60초 기다림을 손잡이로 바로 끝냄 → 탈락 (서버가 끊김을 알아챌 때까지 다시 부름) */
async function dropOut(t, bot) {
    bot.socket.disconnect();
    await expect.poll(async () => (await t.expireGraces()).fired, { timeout: 15_000, message: '끊긴 봇이 탈락함' }).toContain(uid(bot));
}

// 영상 연출 셋 (암살 영상·추방 연출·결과 영상) — 건너뛰기는 이 안에서만 찾음 (밤 차례의 "건너뛰기" 단추와 안 섞이게)
const VIDEO_COVERS = '[data-ingame-night-success-kill], [data-ingame-tribunal-expulsion], [data-game-result-intro]';

/** 영상 연출이 막혀 뜬 건너뛰기는 누르고, 낮 시작 글 창은 확인 (연출 자체를 안 보는 시험이 씀) */
async function passCovers(page) {
    const skip = page.locator(VIDEO_COVERS).getByRole('button', { name: '건너뛰기' }).first();
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
    await n.closeDawnReport(page);
}

// 화면이 띄우는 브라우저 확인 창(나가기 확인)을 전부 수락
function acceptConfirms(page) {
    page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });
}

/** 사람이 산 채로 나가기: 왼쪽 위 "게임 나가기" → 확인 창 수락 → 방 고르는 화면 */
async function leaveAliveUi(page) {
    acceptConfirms(page);
    const button = page.locator('[aria-label="인게임 컨트롤"]').getByRole('button', { name: '게임 나가기' });
    await expect(async () => {
        await passCovers(page);
        await button.click({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
}

/** 내가 죽은 뒤 뜨는 선택 창에서 고르기 ('관전 계속하기'·'게임 나가기') — 추방·낮 시작 연출이 덮고 있으면 넘기면서 */
async function deadChoice(page, name) {
    if (name === '게임 나가기') acceptConfirms(page);
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await passCovers(page);
        await dialog.getByRole('button', { name }).click({ timeout: 1500 });
    }).toPass({ timeout: 45_000 });
    if (name === '게임 나가기') await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    else await expect(dialog).toBeHidden();
}

// 결과판 (참가자 정체 목록)·그 안 줄·받은 골드 칸
const board = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });
const rows = (page) => board(page).getByRole('listitem');
const rowOf = (page, nickname) => rows(page).filter({ hasText: nickname });
const goldCells = (page) => board(page).getByTestId('game-result-gold-reward');
// 승패 띠 글 ("승리"·"패배")
const banner = (page) => page.getByText(/^(승리|패배)$/);

/** 결과판이 보일 때까지: 연출이 막고 있으면 넘기고(passCovers) 참가자 목록을 기다림 → 결과판 */
async function reachBoard(page, { timeout = 60_000 } = {}) {
    await expect(async () => {
        await passCovers(page);
        await expect(board(page)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    return board(page);
}

/** 판이 안 끝났는지: 판 화면 그대로·결과판 없음·서버 승패 없음 → 판 요약 */
async function expectStillPlaying(t, page) {
    const s = await t.state();
    expect(s?.winResult ?? null, '서버 승패 없음').toBeNull();
    await expect(page).toHaveURL(/\/ingame/);
    await expect(board(page)).toHaveCount(0);
    return s;
}

/** 줄마다 직업 글 확인: people = [[사람·봇, 직업], …] */
async function expectJobs(page, people) {
    for (const [who, role] of people) {
        await expect(rowOf(page, nick(who)).getByText(JOB_TEXT[role], { exact: true }), `${nick(who)} 줄 직업 글`).toBeVisible();
    }
}

/** 그 판 판 골드 장부 줄 [{ user_id, currency, amount }] (참조 id = game-reward:<판 id>) */
const rewardRows = (gameId) => query(
    "SELECT user_id, currency, amount FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?", [`game-reward:${gameId}`],
);

/** 지갑 골드 (지갑 줄 없으면 0) */
const gold = async (uuid) => Number((await store.wallet(uuid)).gold);

/**
 * 판 끝 처리(전적 저장 → 판 골드 → 업적)가 다 끝날 때까지: 그 판 사람이던 봇이 "경제 값 다시 읽어라" 신호를 받음
 * "안 받았다"를 볼 때 이걸 먼저 기다림 (지급이 아직 안 돈 것과 구별)
 */
const settled = (t, bot) => bot.waitForEvent('account_cache_invalidated', {
    timeoutMs: 30_000, match: (p) => p?.gameId === t.gameId && Array.isArray(p.scopes) && p.scopes.includes('economy'),
});

// 이 시험 프로세스가 넣은 옛 판 id (시험 끝에 cleanSeeds로 지움)
const seededGameIds = [];

/**
 * 옛 판 기록 count판 넣기 (운영 출처·끝까지 간 판) — 업적 셈의 바탕 (판 줄 + 그 사람 참가 줄)
 * 진짜 판을 수십 번 돌릴 수 없어 기준 바로 밑까지만 DB로 채움, 마지막 한 판은 화면으로 진짜 돌림
 * @param {string} uuid
 * @param {number} count
 * @param {{ role?:string, won?:boolean, alive?:boolean }} [o] 그 판 직업·이겼는지·살았는지
 */
async function seedGames(uuid, count, { role = 'CITIZEN', won = false, alive = false } = {}) {
    const team = role === 'JOKER' ? 'JOKER' : 'CITIZEN';
    for (let i = 0; i < count; i += 1) {
        const id = crypto.randomUUID();
        const at = sqlTime(Date.UTC(2026, 8, 1, 0, i));
        await query(
            'INSERT INTO game_results (id, started_at, ended_at, winner, win_reason, day_index, player_count, settings, completed) VALUES (?,?,?,?,?,?,?,?,?)',
            [id, at, at, won ? team : 'NONE', null, 2, 5, JSON.stringify({ gameSource: { v: 1, value: 'production' } }), 1],
        );
        seededGameIds.push(id);
        await query(
            'INSERT INTO game_result_players (game_id, user_id, nickname_snapshot, role, team, won, is_alive, death_reason) VALUES (?,?,?,?,?,?,?,?)',
            [id, uuid, '옛판', role, team, won ? 1 : 0, alive ? 1 : 0, null],
        );
    }
}

/** 넣은 옛 판 지우기 (시험 파일이 test.afterEach로 부름 — 계정은 실행 끝에 지워지지만 판 줄은 남아서) */
async function cleanSeeds() {
    while (seededGameIds.length > 0) {
        const id = seededGameIds.pop();
        await query('DELETE FROM game_result_players WHERE game_id = ?', [id]);
        await query('DELETE FROM game_results WHERE id = ?', [id]);
    }
}

/** 이미 받은 업적으로 적어 둠 (보려는 업적 하나만 새로 받게 — 옛 판을 넣으면 판 수·승 수 업적 기준도 같이 넘음) */
async function markGranted(uuid, achievementIds) {
    for (const achievementId of achievementIds) {
        await query('INSERT INTO achievement_grants (user_id, achievement_id, granted_at) VALUES (?,?,?)', [uuid, achievementId, sqlTime()]);
    }
}

/** 그 사람이 받은 업적 id 목록 */
const grantedIds = async (uuid) => (await query('SELECT achievement_id FROM achievement_grants WHERE user_id = ?', [uuid])).map((r) => r.achievement_id);

/** 화면 소켓이 받은 "업적 받음" 알림의 업적 id 목록 (watchSocket이 모은 것에서) */
const grantedEvents = (got) => got.filter((g) => g.event === 'achievement_granted').map((g) => g.data?.achievementId);

/**
 * 화면 소켓이 받은 사건 모으기 → [{ event, data }] (계속 쌓임)
 * 판에 들어가기 전에 걸어 둠 (방 입장 때 화면이 새로 열리며 소켓도 새로 열림 → 그 소켓부터 잡힘)
 */
function watchSocket(page) {
    const got = [];
    page.on('websocket', (ws) => {
        ws.on('framereceived', ({ payload }) => {
            // socket.io 사건 글 모양: 42["이름",{값}]
            if (typeof payload !== 'string' || !payload.startsWith('42')) return;
            try {
                const [event, data] = JSON.parse(payload.slice(payload.indexOf('[')));
                got.push({ event, data });
            } catch { /* 사건 글이 아님 */ }
        });
    });
    return got;
}

/**
 * 관리자 창 하나 열고 로그인 → 판 골드 값을 관리자 API로 바꾸는 손잡이
 * serial 프로젝트는 기본 주소가 게임 화면이라 관리자 주소로 새 창을 엶, 끝나면 close()
 * 값을 바꾼 시험은 끝에 꼭 1로 되돌림 (값은 서버 전체가 같이 씀 → 그런 시험은 @serial)
 * @param {import('@playwright/test').Browser} browser
 * @param {{ viewport?: {width:number,height:number} }} [o]
 */
async function openAdmin(browser, { viewport = { width: 1280, height: 800 } } = {}) {
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    const admin = await admins.createAdmin();
    await admins.loginAsAdmin(page, admin);
    return { context, page, admin, setGold: (value) => setGold(page, value), close: () => context.close() };
}

/** 로그인한 관리자 창의 쿠키로 판 골드 바꾸기 (PUT /admin-api/game-settings, 쓰기 확인 값은 /auth/me에서 받음) */
async function setGold(adminPage, goldReward) {
    const request = adminPage.context().request;
    const me = await request.get(`${E2E.adminUrl}/admin-api/auth/me`);
    expect(me.ok(), `관리자 세션 확인 (${me.status()})`).toBe(true);
    const { csrfToken } = await me.json();
    const res = await request.put(`${E2E.adminUrl}/admin-api/game-settings`, {
        data: { goldReward }, headers: { origin: E2E.adminUrl, 'x-admin-csrf': csrfToken },
    });
    expect(res.ok(), `판 골드를 ${goldReward}로 바꾸기 (${res.status()})`).toBe(true);
}

// 관리자 "판 설정" 화면 칸: 지금 값·바꾸기 폼·입력 칸·폼의 바꾸기 단추·확인 창
const settingsScreen = Object.freeze({
    now: (page) => page.getByTestId('game-settings-gold'),
    form: (page) => page.getByRole('form', { name: '판 골드 바꾸기' }),
    input: (page) => page.getByRole('form', { name: '판 골드 바꾸기' }).getByLabel('판마다 주는 골드'),
    submit: (page) => page.getByRole('form', { name: '판 골드 바꾸기' }).getByRole('button', { name: '바꾸기' }),
    confirm: (page) => page.getByRole('dialog', { name: '판 골드를 바꿀까요?' }),
});

/** 판 설정 화면에서 값을 넣고 "바꾸기" → 확인 창이 뜨면 그 창을 돌려줌 (확인·취소는 시험이 누름) */
async function askGoldChange(adminPage, value) {
    await settingsScreen.input(adminPage).fill(String(value));
    await settingsScreen.submit(adminPage).click();
    const box = settingsScreen.confirm(adminPage);
    await expect(box).toBeVisible();
    return box;
}

/** 표에 적힌 판 골드 값 (game_settings GAME_GOLD_REWARD) */
const goldSetting = async () => Number((await query("SELECT value_int FROM game_settings WHERE `key` = 'GAME_GOLD_REWARD'"))[0]?.value_int);

module.exports = {
    WIN_TEXT, JOB_TEXT, LONG_TIMES, uid, nick, C, settingsOf, closeReveal, open, aliveBots, ask, toTribunal, verdict, execute, nightKill,
    leave, dropOut, passCovers, acceptConfirms, leaveAliveUi, deadChoice, board, rows, rowOf, goldCells, banner, reachBoard, expectStillPlaying,
    expectJobs, rewardRows, gold, settled, seedGames, cleanSeeds, markGranted, grantedIds, grantedEvents, watchSocket, openAdmin, setGold, goldSetting,
    settingsScreen, askGoldChange,
};
