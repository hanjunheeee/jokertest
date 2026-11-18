'use strict';

// 재판(A04) 브라우저 시험 도우미 파일, PC·모바일 화면을 같은 고르개로 다루고 봇 표·사람 표로 재판을 열고 닫음 (사람 여럿·여러 날·진짜 시간)
// tests/mobile/a04-*.spec.js와 tests/ingame/a04-*.hard.spec.js가 씀 (이름이 .spec이 아니라 시험으로 안 돎)
const { expect } = require('@playwright/test');
const { E2E } = require('../../helpers/env');
const ui = require('../../helpers/ui');
const { e2e } = require('../../helpers/internal');
const { Table } = require('../../helpers/game');
const { sleep } = require('../../helpers/wait');
const { expectReadable } = require('../../helpers/visible');

const uuidOf = (x) => x.account.uuid;
const nickOf = (x) => x.nickname ?? x.account.nickname;
// 모바일 화면인지: 주소가 모바일 화면 서버면 모바일
const isMobile = (page) => page.url().startsWith(E2E.mobileUrl);

// 화면 글 (frontend constants/actions/ingameActionPanel.js·ingameTribunalExpulsionPresentation.js와 같은 글)
const VOTE_LABEL = Object.freeze({ GUILTY: '유죄', NOT_GUILTY: '무죄' });
const TEXT = Object.freeze({
    done: '투표가 완료되었습니다.',
    defendant: '당신은 피고인입니다. 투표할 수 없습니다.',
    dead: '사망한 참가자는 투표할 수 없습니다.',
    settle: '5초 뒤 마감',
    night: '밤이 되었습니다',
    citizenWin: '시민 진영 승리',
    jokerWin: '광대 진영 승리',
});
// 서버가 끝난 재판 표를 거절할 때 화면 글 (frontend utils/voteSubmitPatch.js)
const LATE_VOTE_TEXTS = Object.freeze(['재판이 끝나 투표할 수 없습니다.', '재판이 이미 판정되어 투표할 수 없습니다.']);

// 고르개: PC·모바일 둘 다 같은 표시(data-*)·이름을 씀
const trial = {
    win: (page) => page.locator('[data-ingame-tribunal-presentation]'),
    button: (page, vote) => page.getByRole('button', { name: VOTE_LABEL[vote], exact: true }),
    done: (page) => page.getByText(TEXT.done, { exact: true }),
    defendantNotice: (page) => page.getByText(TEXT.defendant, { exact: true }),
    deadNotice: (page) => page.getByText(TEXT.dead, { exact: true }),
    error: (page) => page.locator('[data-ingame-tribunal-vote-error]'),
    // 재판 채팅 칸: PC는 역할 없는 칸이라 이름표(aria-label)로 찾음
    chat: (page) => page.locator('[aria-label="최후의 반론 채팅"]'),
    chatLog: (page) => trial.chat(page).getByRole('log', { name: '채팅 내역' }),
    // 피고 카드: 모바일은 재판 카드 표시, PC는 재판 창 안 플레이어 카드
    card: (page) => (isMobile(page) ? page.locator('[data-tribunal-defendant]') : trial.win(page).locator('[data-ingame-player-nickname]').first()),
    expulsion: (page) => page.locator('[data-ingame-tribunal-expulsion]'),
    expelText: (nickname) => `[${nickname}]님이 가면무도회에서 추방당하셨습니다.`,
    nightNotice: (page) => page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: TEXT.night }),
    deadChoice: (page) => page.getByRole('dialog', { name: '사망 후 선택' }),
    // 모바일 위 단계 줄 ("제 1일 · 재판 진행 0:14")
    phaseLine: (page) => page.locator('[data-talk-phase-line]'),
    // PC 시간 바 상태 글 (재판 연출 중엔 시간 바가 늘 펼쳐져 있고, 마감이 당겨지면 그 글이 "[5초 뒤 마감]"으로 바뀜 — 새로고침해도 그대로)
    settleLabel: (page) => page.getByText(`[${TEXT.settle}]`, { exact: true }),
    // 판 카드 상태 표시 (alive·dead·disconnected), 재판 창 카드와 겹치면 판 쪽이 먼저
    // 판에서 빠진 사람(스스로 나감·끊겨 60초 못 돌아옴)은 dead — 재판 중 빠진 피고도 사망으로 처리됨
    seat: (page, nickname) => page.locator(`[data-ingame-player-nickname="${nickname}"]`).first(),
};

/**
 * 사람 눈에 읽히는지 (helpers/visible.js): 바탕색은 요소 사진으로 잼
 * 판 화면 맨 밑이 검정 칸이라 스타일로 재면 그림·덮개 위 글이 다 검정 바탕으로 나옴 → 사진의 실제 바탕과 견줌
 */
const readable = (locator, o = {}) => expectReadable(locator, { method: 'pixels', ...o });

/**
 * PC 남은 시간 자리를 시간 바로 고정 (화면을 개발 서버로 띄우면 기본이 채팅 틀이라 재판 중엔 "[5초 뒤 마감]"·남은 시간이 안 보임)
 * 판 화면이 뜨기 전에(로비에서) 부름
 */
async function pinTimebar(page) {
    if (isMobile(page)) return;
    await page.evaluate(() => {
        try { window.localStorage.setItem('joker.ingame.timerPlacement', 'timebar'); } catch { /* 저장 막힘 */ }
    });
}

/**
 * 판 카드 누름 칸: PC는 카드 메뉴 단추, 모바일은 초상 띠·카드 판 칸
 * 모바일 칸 읽기 이름: "닉네임", 같은 직업 동료면 "닉네임 · 동료 광대", 그 뒤에 ", 나"·", 사망"·", 연결 끊김" (frontend-mobile utils/talk/slotLabel.js)
 */
function slot(page, nickname) {
    if (isMobile(page)) return page.getByRole('button', { name: new RegExp(`^${nickname}( · 동료 [^,]+)?(,|$)`) }).first();
    return page.locator('[role="button"][aria-haspopup="menu"]').filter({ has: page.locator(`[data-ingame-player-nickname="${nickname}"]`) });
}

/** 판 요약을 조건 맞을 때까지 기다림 (단계를 넘기지 않음) */
async function waitState(t, match, { timeout = 20000, message = '판 상태 기다림' } = {}) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last ? Boolean(match(last)) : false; }, { timeout, message }).toBe(true);
    return last;
}

const playerOf = (s, uuid) => s.players.find((p) => p.uuid === uuid) ?? null;
const aliveUuids = (s) => new Set(s.players.filter((p) => p.alive && p.isParticipating !== false).map((p) => p.uuid));
/** 살아 있고 창이 열려 있는 사람(브라우저) */
const livingHumans = (t, s) => t.humans.filter((h) => aliveUuids(s).has(uuidOf(h)) && !h.page.isClosed());
/** 투표할 봇: 산 봇 중 피고 뺀 것 */
async function votersOf(t, defendant) {
    const alive = aliveUuids(await t.state());
    return t.bots.filter((b) => alive.has(uuidOf(b)) && uuidOf(b) !== uuidOf(defendant));
}

/**
 * 떠 있는 안내 창을 닫아 가며 fn이 될 때까지 다시 (늦게 뜨는 안내 창이 누르기를 막는 것 막기)
 * 추방 연출은 글 단계에서 누르면 끝남, 낮 시작 영상이 자동 재생에 막히면 다시 재생 누름
 */
async function calm(page, fn = async () => {}, { timeout = 25000, keepWatching = true, names = ui.OVERLAY_DIALOGS } = {}) {
    await expect(async () => {
        await ui.closeOverlays(page, { keepWatching, names, clickTimeoutMs: 1500 });
        const expulsion = trial.expulsion(page);
        if (await expulsion.count() > 0) {
            // 영상이 멈춰 건너뛰기 단추가 떴으면 그것부터, 글 단계면 화면을 눌러 끝냄
            const skip = expulsion.getByRole('button', { name: '건너뛰기' });
            if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 500 }).catch(() => {});
            await expulsion.first().click({ timeout: 500, force: true }).catch(() => {});
        }
        const replay = page.getByRole('button', { name: '화면을 눌러 다시 재생' });
        if (await replay.isVisible().catch(() => false)) await replay.click({ timeout: 500 }).catch(() => {});
        await fn();
    }).toPass({ timeout });
}

/** 역할 고정: 사람은 시민, 첫 봇은 광대 (extra로 덮어씀 — 값 또는 ({ humans, bots }) => 값) */
function plainRoles(extra = {}) {
    return ({ humans, bots }) => ({
        ...Object.fromEntries(humans.map((h) => [uuidOf(h), 'CITIZEN'])),
        [uuidOf(bots[0])]: 'JOKER',
        ...(typeof extra === 'function' ? extra({ humans, bots }) : extra),
    });
}

/** 정한 역할이 서버 판에 그대로 들어갔는지 (예약이 가끔 못 맞음 → 바로 알림) */
async function expectRoles(t, presets) {
    const s = await t.state();
    for (const [uuid, role] of Object.entries(presets)) expect(playerOf(s, uuid)?.role, `역할 미리 정하기 (${uuid})`).toBe(role);
}

// 넉넉한 단계 시간 (서버가 받는 가장 긴 값): 단계는 손잡이로 넘기니 길어도 안 느림, 화면 확인 도중 진짜 마감이 먼저 와 버리는 것 막기
// 시간 규칙을 보는 시험은 settings로 그 값만 덮어씀 (예: { tribunalTime: 15 })
const ROOMY_TIMES = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

/** 판 차리고 사람 모두 역할 확인 창 닫기 → Table (roles는 꼭 줌, 단계 시간은 넉넉하게) */
async function openTable(table, { humans, bots, settings = {}, roles }) {
    for (const h of humans) await pinTimebar(h.page);
    const t = await table.setup({ humans, bots, settings: { ...ROOMY_TIMES, ...settings }, roles });
    await expectRoles(t, typeof roles === 'function' ? roles({ humans, bots: t.bots }) : roles);
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page)));
    return t;
}

/** 화면으로 차린 판(사람이 방장)에서 역할이 맞는지 보고 역할 확인 창 닫기 */
async function afterStart(t, roles) {
    await expectRoles(t, roles);
    await Promise.all(t.humans.map((h) => ui.readRoleReveal(h.page)));
    return t;
}

/**
 * 그 날 낮 투표까지 단계 넘기기 (역할 확인·토론·밤 차례는 손잡이로), screens면 산 사람 화면 안내 창을 닫고 기권 단추까지
 * @param {number} dayIndex 1부터
 */
async function toVote(t, dayIndex = 1, { screens = true } = {}) {
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === dayIndex, { stepDelayMs: 500 });
    const now = await t.state();
    if (now.dayPhase !== 'DAY_VOTE') await t.advance();
    const s = await waitState(t, (g) => g.phase === 'DAY' && g.dayIndex === dayIndex && g.dayPhase === 'DAY_VOTE', { message: '낮 투표 기다림' });
    if (screens) {
        for (const h of livingHumans(t, s)) {
            // 손잡이로 밤을 건너뛰면 전날 추방 연출(영상 최대 12초)이 아직 덮고 있을 수 있음 → 끝날 때까지 (진짜 판은 밤 동안 끝남)
            await calm(h.page, async () => {
                await expect(trial.expulsion(h.page)).toHaveCount(0, { timeout: 1000 });
                await expect(h.page.getByRole('button', { name: '기권' }).first()).toBeVisible({ timeout: 1000 });
            });
        }
    }
    return s;
}

/**
 * 화면으로 낮 투표: 카드 메뉴 "투표하기" → 같은 카드 메뉴가 "투표취소"로 바뀌면 들어간 것
 * 기권 단추로는 못 봄 (사람을 찍어도 기권 단추는 안 잠김 — 사용자 결정 2026-11-18, 연출 중엔 따로 꺼짐 — actionPanelLocks.js interactionBlocked)
 */
async function dayVoteUi(page, nickname) {
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    const cancel = menu.getByRole('menuitem', { name: '투표취소', exact: true });
    await calm(page, async () => {
        if (!(await menu.isVisible().catch(() => false))) await slot(page, nickname).click({ timeout: 1500 });
        if (await cancel.isVisible().catch(() => false)) return;
        await menu.getByRole('menuitem', { name: '투표하기', exact: true }).click({ timeout: 1500 });
        await expect(menu).toBeHidden({ timeout: 3000 });
        // 메뉴를 다시 열어 "투표취소"로 확인 (고르면 메뉴가 닫힘, 안 닫혔으면 이번 누름이 닫고 다음 바퀴가 엶)
        await slot(page, nickname).click({ timeout: 1500 });
        await expect(cancel).toBeVisible({ timeout: 1500 });
    });
    // 확인하느라 연 메뉴 닫기 (Esc로 닫힘)
    if (await menu.isVisible().catch(() => false)) await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
}

/** 봇들 낮 표 (같은 대상) */
async function botsDayVote(t, targetUuid, bots) {
    for (const bot of bots) {
        const r = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: targetUuid });
        if (!r?.ok) throw new Error(`봇 낮 표 실패: ${r?.code}`);
    }
}

/**
 * 낮 투표에서 defendant를 재판에 세움: 산 봇이 찍고, 봇 표가 기권(사람·피고)보다 많지 않으면 사람도 화면으로 찍음
 * 피고는 안 찍음 → 다 차서 생기는 5초 당김 없이 손잡이로 바로 판정
 * @param {object} [o]
 * @param {'auto'|boolean} [o.humansVote='auto'] 사람이 화면으로 찍을지 (auto = 봇 표가 모자랄 때만)
 * @param {object[]} [o.skipBots] 표를 안 낼 봇 (끊긴 봇)
 */
async function toTribunal(t, defendant, { humansVote = 'auto', skipBots = [] } = {}) {
    const dUuid = uuidOf(defendant);
    const s0 = await t.state();
    const alive = aliveUuids(s0);
    const skip = new Set(skipBots.map(uuidOf));
    const voters = t.bots.filter((b) => alive.has(uuidOf(b)) && uuidOf(b) !== dUuid && !skip.has(uuidOf(b)));
    await botsDayVote(t, dUuid, voters);
    const humans = livingHumans(t, s0).filter((h) => uuidOf(h) !== dUuid);
    // 최다 득표가 기권보다 많아야 재판 (같거나 적으면 밤)
    const short = voters.length <= alive.size - voters.length;
    const uiVoters = humansVote === 'auto' ? (short ? humans : []) : humansVote ? humans : [];
    for (const h of uiVoters) await dayVoteUi(h.page, nickOf(defendant));
    await t.advance();
    const s = await waitState(t, (g) => g.phase !== 'DAY', { message: '낮 판정 기다림' });
    if (s.phase !== 'TRIBUNAL' || s.tribunal?.defendantUuid !== dUuid) throw new Error(`재판이 안 열림: ${s.phase} (봇 표 ${voters.length}, 사람 표 ${uiVoters.length})`);
    return s;
}

/**
 * 판 차려 1일 재판까지: pick(t)이 피고(기본 맨 끝 봇 = 시민), 사람 화면에 재판 창이 뜰 때까지
 * @returns {Promise<{ t: import('../../helpers/game').Table, d: object }>}
 */
async function startTrial(table, { humans, bots, settings = {}, roles = plainRoles(), pick = (t) => t.bots[t.bots.length - 1], humansVote = 'auto' }) {
    const t = await openTable(table, { humans, bots, settings, roles });
    await toVote(t, 1);
    const d = pick(t);
    await toTribunal(t, d, { humansVote });
    for (const h of humans) await expect(trial.win(h.page)).toBeVisible({ timeout: 15000 });
    return { t, d };
}

/** 봇 재판 표: plan이 글이면 bots 모두 같은 표, 배열이면 [[bot, 표], ...] */
async function botsTribunal(t, plan, bots = []) {
    const pairs = Array.isArray(plan) ? plan : bots.map((b) => [b, plan]);
    const { dayIndex } = await t.state();
    for (const [bot, vote] of pairs) {
        const r = await bot.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex, vote });
        if (!r?.ok) throw new Error(`봇 재판 표 실패: ${r?.code}`);
    }
}

/** 화면으로 재판 표: 단추 누르고 완료 글까지 */
async function pressVote(page, vote) {
    await trial.button(page, vote).click();
    await expect(trial.done(page)).toBeVisible();
}

/** 재판 마감을 손잡이로 바로 (안 낸 사람은 기권) → 재판을 벗어난 판 요약 — 5초·마감 시간을 보는 시험에선 안 씀 */
async function endTribunal(t) {
    const s = await t.state();
    if (s?.phase === 'TRIBUNAL') await t.advance();
    return waitState(t, (g) => g.phase !== 'TRIBUNAL', { message: '재판 판정 기다림' });
}

/** 유죄·무죄 단추가 사람 눈에 읽히는지: 단추 자리(보임·화면 안·안 가려짐) + 그림 위 글 대비 */
async function expectButtonsReadable(page) {
    for (const vote of ['GUILTY', 'NOT_GUILTY']) {
        const button = trial.button(page, vote);
        await expectReadable(button, { contrast: false });
        await expect(button).toBeEnabled();
        // 글 칸은 누름이 통과(pointer-events:none)라 가려짐 검사는 단추 쪽에서만
        await readable(button.getByText(VOTE_LABEL[vote], { exact: true }), { uncovered: false });
    }
}

/** 피고 카드가 보이고 닉네임이 적혀 있는지 (그림 카드라 대비는 안 봄) */
async function expectCardReadable(page, nickname) {
    await expectReadable(trial.card(page), { contrast: false });
    await expect(trial.card(page)).toContainText(nickname);
}

/** 추방 글이 뜰 때까지 (PC는 영상이 멈추면 건너뛰기 단추가 떠서 그것을 누름) → 글 locator, 글은 3초쯤 뒤 저절로 사라짐 */
async function waitExpelText(page, nickname, { timeout = 30000 } = {}) {
    const text = page.getByText(trial.expelText(nickname), { exact: true });
    const skip = trial.expulsion(page).getByRole('button', { name: '건너뛰기' });
    await expect(async () => {
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 500 }).catch(() => {});
        await expect(text).toBeVisible({ timeout: 500 });
    }).toPass({ timeout });
    return text;
}

/** 추방 글 "[닉네임]님이 가면무도회에서 추방당하셨습니다."가 사람 눈에 읽히는지 */
async function expectExpelReadable(page, nickname) {
    await readable(await waitExpelText(page, nickname));
}

/** 안내 글(피고·사망·완료)이 읽히는지 — 글 칸이 누름 통과라 가려짐 검사는 뺌 */
const expectNoticeReadable = (locator, o = {}) => readable(locator, { uncovered: false, ...o });

/**
 * "5초 뒤 마감"이 보이는지: 모바일은 위 단계 줄(재판 덮개 아래라 글만 봄), PC는 펼쳐진 시간 바 글
 * 당기는 중에 새로고침해도 그대로 보임 (서버가 다시 준 판 값에 당김 표시가 실림)
 * light면 PC도 보이는지만 봄 (화면 여럿을 5초 안에 다 볼 때 — 대비까지 재면 5초를 넘김)
 */
async function expectSettleShown(page, { timeout = 4000, light = false } = {}) {
    if (isMobile(page)) return expect(trial.phaseLine(page)).toContainText(TEXT.settle, { timeout });
    if (light) return expect(trial.settleLabel(page)).toBeVisible({ timeout });
    return readable(trial.settleLabel(page), { uncovered: false, timeout });
}
async function expectNoSettle(page) {
    if (isMobile(page)) return expect(trial.phaseLine(page)).not.toContainText(TEXT.settle);
    return expect(trial.settleLabel(page)).toHaveCount(0);
}

/** 재판 창이 닫힌 시각(ms) — 화면 안에서 프레임마다 봐서 늦지 않음 */
async function closedAt(page, { timeout = 20000 } = {}) {
    await trial.win(page).waitFor({ state: 'hidden', timeout });
    return Date.now();
}

/** 그 시각까지 진짜로 기다림 (시간 규칙을 보는 시험만) */
async function sleepUntil(at) {
    const ms = at - Date.now();
    if (ms > 0) await sleep(ms);
}

// 진짜 시간 허용 폭 (시험_계획 3-5)
const TOLERANCE_MS = 1500;
function expectNear(actual, target, label) {
    expect(Math.abs(actual - target), `${label}: 차이 ${actual - target}ms (허용 ±${TOLERANCE_MS}ms)`).toBeLessThanOrEqual(TOLERANCE_MS);
}

/** 서버가 정한 재판 마감 시각(ms) — 봇 스냅샷에서 */
async function tribunalDeadline(t, bot = t.bots[0]) {
    const snap = await bot.snapshot(t.gameId);
    if (!Number.isFinite(snap?.tribunalDeadline)) throw new Error('재판 마감 시각을 못 읽음');
    return snap.tribunalDeadline;
}

/** 화면에 보이는 남은 초: 모바일은 단계 줄, PC는 펼쳐진 시간 바 타이머 (안 보이면 null) */
async function clockSeconds(page) {
    const target = isMobile(page) ? trial.phaseLine(page) : page.getByRole('timer').first();
    const text = await target.innerText({ timeout: 1000 }).catch(() => '');
    const m = text.match(/(\d+):(\d\d)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * 화면 소켓 글 적어 두기: 화면이 보낸 요청과 서버 답(ack), 받은 사건 — 판에 들어가기 전에 걸어야 그 소켓이 잡힘
 * @returns {{ sent: object[], acks: object[], events: object[] }}
 */
function socketLog(page) {
    const log = { sent: [], acks: [], events: [] };
    const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
    page.on('websocket', (ws) => {
        ws.on('framesent', (frame) => {
            const m = /^42(\d*)(\[.*)$/s.exec(String(frame.payload));
            const body = m ? parse(m[2]) : null;
            if (body) log.sent.push({ event: body[0], payload: body[1], ackId: m[1] || null, ws, at: Date.now() });
        });
        ws.on('framereceived', (frame) => {
            const raw = String(frame.payload);
            const event = /^42(\d*)(\[.*)$/s.exec(raw);
            const eventBody = event ? parse(event[2]) : null;
            if (eventBody) log.events.push({ event: eventBody[0], payload: eventBody[1], raw, at: Date.now() });
            const ack = /^43(\d+)(\[.*)$/s.exec(raw);
            const ackBody = ack ? parse(ack[2]) : null;
            if (ackBody) log.acks.push({ ackId: ack[1], payload: ackBody[0], ws, at: Date.now() });
        });
    });
    return log;
}

/** 그 사건으로 화면이 보낸 요청과 서버 답 짝 [{ payload, reply, at }] */
function repliesOf(log, event) {
    return log.sent.filter((s) => s.event === event).map((s) => ({
        payload: s.payload, at: s.at, reply: log.acks.find((a) => a.ws === s.ws && a.ackId === s.ackId)?.payload ?? null,
    }));
}

/** 서버가 그 재판 표를 받았다는 답이 왔는지 ({ ok: true, vote, dayIndex }) */
async function expectVoteAccepted(log, vote, dayIndex) {
    await expect.poll(
        () => repliesOf(log, 'cast_tribunal_vote').some((r) => r.reply?.ok === true && r.reply.vote === vote && (dayIndex === undefined || r.reply.dayIndex === dayIndex)),
        { message: `서버가 재판 표 ${vote}를 받았다는 답` },
    ).toBe(true);
}

/**
 * 서버 → 화면 사건을 잠깐 붙잡는 문 (판정 알림이 아직 안 온 화면 만들기), 판에 들어가기 전에 걸어야 함
 * 답(ack)·살아 있음 확인은 그대로 넘겨 화면이 누른 요청의 답은 받음
 */
async function socketGate(page) {
    const gate = { holding: false, held: [] };
    gate.release = () => { gate.holding = false; for (const send of gate.held.splice(0)) send(); };
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => {
            if (gate.holding && typeof message === 'string' && message.startsWith('42')) { gate.held.push(() => ws.send(message)); return; }
            ws.send(message);
        });
    });
    return gate;
}

/** 이 화면이 새로고침으로 열린 것인지 ('navigate' = 주소로 들어옴, 'reload' = 새로고침) */
const navigationType = (page) => page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type ?? null);

/** 결과 화면에서 이긴 진영 글까지 (연출 영상이 막히면 건너뛰기) */
async function expectResult(page, teamLabel) {
    await expect(page).toHaveURL(/\/gameresult/, { timeout: 60000 });
    const skip = page.getByRole('button', { name: '건너뛰기' });
    const badge = page.getByText(teamLabel, { exact: true });
    await expect(async () => {
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await expect(badge).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 45000 });
    return badge;
}

// 낮 시작 연출 (밤에 죽은 사람이 있으면 영상 + 글, 영상이 안 되면 글 창)
const dawnReport = (page) => page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]');

/** 낮 시작 연출이 끝날 때까지 (글 창이면 확인, 영상이 막히면 다시 재생) — 연출이 화면을 덮어 누르기를 막는 것 막기 */
async function passDawn(page) {
    await calm(page, () => expect(dawnReport(page)).toHaveCount(0, { timeout: 1000 }), { timeout: 45000 });
}

/** 사망 후 선택 창이 뜰 때까지(앞 연출은 닫으며) → "관전 계속하기" */
async function keepWatching(page) {
    const dialog = trial.deadChoice(page);
    await calm(page, () => expect(dialog).toBeVisible({ timeout: 1000 }), { keepWatching: false, timeout: 45000 });
    await dialog.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(dialog).toBeHidden();
}

/**
 * 판에서 나가기 (산 사람): 재판 중엔 위 줄 "게임 나가기"가 잠겨 있어 브라우저 뒤로 가기로 나가기 확인 창을 띄움 (확인 창 = window.confirm)
 * 같은 나가기 요청(requestExit)을 탐 — frontend hooks/useInGameExit.js
 */
async function leaveByBack(page) {
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    await page.evaluate(() => window.history.back());
    await expect(page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
}

/** 사망 후 선택 창의 "게임 나가기" → 확인 창 수락 → 판 화면을 벗어남 */
async function leaveFromDeadChoice(page) {
    const dialog = trial.deadChoice(page);
    await calm(page, () => expect(dialog).toBeVisible({ timeout: 1000 }), { keepWatching: false, timeout: 45000 });
    page.once('dialog', (d) => { d.accept().catch(() => {}); });
    await dialog.getByRole('button', { name: '게임 나가기' }).click();
    await expect(page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
}

/** 화면으로 새 방 만들기 (기본 설정) → 서버 방 요약 — PC·모바일 같은 주소·단추 */
async function createRoomFromLobby(person) {
    await ui.gotoLobby(person.page);
    await person.page.goto('/game-setup');
    await person.page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(person.page).toHaveURL(/\/game-matching/, { timeout: 15000 });
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(uuidOf(person)); return Boolean(room); }, { message: '새 방이 서버에 생김' }).toBe(true);
    return room;
}

/** 탭을 닫았던 사람이 같은 브라우저에 새 탭으로 판에 돌아옴 → 새 page */
async function reopen(person) {
    const page = await person.context.newPage();
    await page.goto('/ingame');
    return page;
}

/**
 * 대기방에 돌아온 사람들로 같은 방에서 다음 판 시작 (사람만): 손님 준비 → 역할 정하기 → 방장 준비·시작 → 새 Table
 * @param {{ host: object, guests: object[], roles: Record<string,string> }} o
 */
async function startNextGame({ host, guests, roles }) {
    for (const g of guests) await ui.readyUi(g.page);
    for (const g of guests) await expect(g.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    // 서버 방에 손님 준비가 다 들어간 뒤 시작 (방장 화면에 늦게 퍼지면 시작이 막힘)
    const guestUuids = guests.map(uuidOf);
    let room = null;
    await expect.poll(async () => {
        room = await e2e.roomOf(uuidOf(host));
        const ready = new Set((room?.players ?? []).filter((p) => p.isReady).map((p) => p.uuid));
        return guestUuids.every((uuid) => ready.has(uuid));
    }, { message: '손님 모두 준비 완료' }).toBe(true);
    await e2e.setRoles(roles, { roomId: room.roomId });
    await ui.readyUi(host.page);
    await expect(host.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await host.page.getByRole('button', { name: '게임시작' }).click();
    const humans = [host, ...guests];
    for (const p of humans) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    const game = await e2e.gameOf(uuidOf(host));
    const t = new Table({ room, bots: [], humans });
    t.gameId = game.gameId;
    await expectRoles(t, roles);
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page)));
    return t;
}

/** 재판 채팅 칸에 글 쓰고 보내기 (PC·모바일 같은 이름) */
async function sayInTrial(page, text) {
    const box = trial.chat(page);
    await expect(box).toBeVisible({ timeout: 10000 });
    await box.getByRole('textbox', { name: '채팅 입력' }).fill(text);
    await box.getByRole('button', { name: '채팅 보내기' }).click();
}

/** 시험마다 다른 글 (다른 시험 채팅과 안 섞이게) */
const uniq = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;

module.exports = {
    uuidOf, nickOf, isMobile, readable, pinTimebar, VOTE_LABEL, TEXT, LATE_VOTE_TEXTS, trial, slot, waitState, playerOf, aliveUuids, livingHumans, votersOf,
    calm, plainRoles, expectRoles, ROOMY_TIMES, openTable, afterStart, toVote, dayVoteUi, botsDayVote, toTribunal, startTrial, botsTribunal, pressVote, endTribunal,
    expectButtonsReadable, expectCardReadable, waitExpelText, expectExpelReadable, expectNoticeReadable, expectSettleShown, expectNoSettle, closedAt, sleepUntil, TOLERANCE_MS, expectNear,
    tribunalDeadline, clockSeconds, socketLog, repliesOf, expectVoteAccepted, socketGate, navigationType, expectResult, dawnReport, passDawn, keepWatching,
    leaveByBack, leaveFromDeadChoice, createRoomFromLobby, reopen, startNextGame, sayInTrial, uniq, sleep,
};
