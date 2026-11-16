'use strict';

// 둘째 날 이후 낮 투표 브라우저 시험 (PC) — 2일엔 낸 표시 새로, 날마다 다시 5초, 1~3일 결과, 2일 [버그 9], 같은 방 두 번째 판
// 목록 A03-낮투표.md 번호 A03-E-199·201·203~206·208 — 밤·재판 마감은 앞 단계라 손잡이로, 낮 5초는 진짜로 기다림
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const L = require('./a-day/_lib');
const { playToResult } = require('../room/roomHelpers');

// 결과 값 → 현황 창 글 (화면 InGameVoteStatusContent.jsx 글)
const OUTCOME_LABEL = Object.freeze({ TRIBUNAL: '재판 회부', TIE: '동점', ABSTAIN_MAJORITY: '기권이 많아 재판 없음', ABSTAINED: '전원 기권' });

const U = (x) => x.account.uuid;
// uuid → 닉네임 (사람·봇 둘 다 account에 있음)
const nickOf = (t, uuid) => [...t.bots, ...t.humans].find((x) => U(x) === uuid).account.nickname;

// 자동 구성대로 직업 고정: 사람 시민, 둘째 봇 광대, 그다음 봇부터 의사(6명~)·경비원(8명~)·마녀사냥꾼(10명), 나머지 시민
function rolesFor(n) {
    const special = ['JOKER', ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
    return ({ humans, bots }) => {
        const out = {};
        for (const h of humans) out[U(h)] = 'CITIZEN';
        bots.forEach((b, i) => { out[U(b)] = special[i - 1] ?? 'CITIZEN'; });
        return out;
    };
}

// n명 판 (사람 1 + 봇 n-1) 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user, n, settings = {}) {
    const roles = rolesFor(n);
    const t = await table.setup({ humans: [user], bots: n - 1, settings, roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(want[p.uuid]);
    return t;
}

// 표 모양 → 표 목록 (null = 기권) → 예: ([[X, 2], [Y, 1]], 2) → [X, X, Y, null, null]
const ballots = (targets, abstain = 0) => [...targets.flatMap(([u, k]) => Array(k).fill(u)), ...Array(abstain).fill(null)];

// 표 목록을 사람마다 나눔 (자기 자신 찍는 표는 안 줌), fixed는 미리 정한 사람 표 → Map(uuid → 대상)
function assignBallots(voters, list, fixed = {}) {
    const left = [...list];
    const out = new Map();
    for (const [u, b] of Object.entries(fixed)) {
        const at = left.indexOf(b);
        if (at < 0) throw new Error('정한 표가 표 모양에 없음');
        left.splice(at, 1);
        out.set(u, b);
    }
    const rest = voters.filter((u) => !out.has(u));
    if (rest.length !== left.length) throw new Error(`표 수(${left.length})와 낼 사람 수(${rest.length})가 다름`);
    const place = (i) => {
        if (i === rest.length) return true;
        for (let k = 0; k < left.length; k += 1) {
            const b = left[k];
            if (b === rest[i]) continue;
            left.splice(k, 1);
            out.set(rest[i], b);
            if (place(i + 1)) return true;
            left.splice(k, 0, b);
            out.delete(rest[i]);
        }
        return false;
    };
    if (!place(0)) throw new Error('표 모양을 못 나눔 (자기 자신 표만 남음)');
    return out;
}

// 봇 낮 표 (답이 ok여야 함)
async function castBots(t, plan, bots = t.bots) {
    for (const bot of bots) {
        if (!plan.has(U(bot))) continue;
        const r = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: plan.get(U(bot)) });
        expect(r?.ok, `봇 낮 표 거절: ${r?.code}`).toBe(true);
    }
}

// 사람 표: 카드 메뉴 "투표하기" 또는 "기권" 단추 → 기권 단추가 잠기면 서버가 받은 것 → 받은 시각
async function castHuman(t, page, target) {
    if (target === null) {
        const abstain = page.getByRole('button', { name: '기권' });
        await abstain.click();
        await expect(abstain).toBeDisabled();
    } else {
        await L.voteUi(page, nickOf(t, target));
    }
    return Date.now();
}

// 봇이 받은 알림 한 줄 기다림 → { event, payload, at(받은 시각) }
async function eventRow(bot, event, { since, match = () => true, timeout = 15000 }) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 토론은 손잡이로 넘김(앞 단계 빨리) → 투표 열림, 산 사람 화면에 기권 단추까지 → { since(넘기기 전 시각), deadline(투표 마감 서버 값) }
async function openVote(t, { dayIndex = 1, alivePages = t.humans.map((h) => h.page) } = {}) {
    const since = Date.now();
    await t.advance();
    const row = await eventRow(t.bots[0], 'day_phase_changed', { since, match: (p) => p.dayIndex === dayIndex && p.dayPhase === 'DAY_VOTE' });
    for (const page of alivePages) await expect(page.getByRole('button', { name: '기권' })).toBeVisible();
    return { since, deadline: row.payload.dayPhaseDeadline };
}

// 투표 현황 창 열기 (밤 안내 같은 연출 창이 덮으면 닫고 다시)
async function openStatus(page) {
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await dialog.isVisible())) {
            await ui.closeOverlays(page);
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    return dialog;
}

// 현황 창 결과 글이 읽힘·재판 대상 (재판이면 target 이름, 아니면 없음), abstain 주면 기권 칸 수도 → 창 닫음
async function expectStatus(page, outcome, { abstain, target } = {}) {
    const status = await openStatus(page);
    const out = status.getByTestId('vote-status-outcome');
    await expect(out).toHaveText(OUTCOME_LABEL[outcome]);
    await expectReadable(out);
    if (outcome !== 'TRIBUNAL') await expect(status.getByTestId('vote-status-tribunal-target')).toHaveText('없음');
    if (target !== undefined) await expect(status.getByTestId('vote-status-tribunal-target')).toHaveText(target);
    if (abstain !== undefined) await expect(status.getByTestId('vote-status-public-abstain-count')).toHaveText(String(abstain));
    await status.getByRole('button', { name: '투표 현황 닫기' }).click();
    await expect(status).toBeHidden();
}

// 재판 없이 밤: "밤이 되었습니다" 창 → 재판 창 없음 → 현황 창 결과 글
async function expectNight(page, outcome, opts = {}) {
    await L.closeNotice(page, '밤이 되었습니다');
    await expect(page.getByRole('dialog', { name: '재판' })).toHaveCount(0);
    await expectStatus(page, outcome, opts);
}

// 재판으로 감: 재판 창이 뜨고 피고 이름이 보임 (재판 중엔 판 화면이 잠겨 현황 창은 못 엶)
async function expectTribunal(page, nickname) {
    const dialog = page.getByRole('dialog', { name: '재판' });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(nickname);
    await expectReadable(dialog.getByText(nickname).first());
}

// ── 5초 규칙 확인 (손잡이 안 씀) ──

// 당김 표시 글 (화면 selectInGameTimebarStatusMessage.js)
const SETTLE_LABEL = '[5초 뒤 마감]';
// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5, 늘려서 덮지 않음)
const SLACK_MS = 1500;

// 화면 남은 초 (시계가 없으면 null, 오래 안 기다림)
async function timerSec(page) {
    const text = await page.getByRole('timer').first().innerText({ timeout: 500 }).catch(() => null);
    const m = text?.match(/(\d+):(\d+)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 당김 알림 (그 날 낮) 기다림 → 알림 한 줄
const waitSettle = (t, since, dayIndex = 1) => eventRow(t.bots[0], 'phase_settle_started', {
    since, match: (p) => p.phase === 'DAY' && p.dayIndex === dayIndex, timeout: 4000,
});

// 화면: 남은 초 5 이하 + "[5초 뒤 마감]"이 읽힘 (5초 안에 끝나게 짧게 기다림)
async function expectSettleUi(page) {
    await expect.poll(async () => (await timerSec(page)) ?? 99, { timeout: 3000, message: '남은 초 5 이하' }).toBeLessThanOrEqual(5);
    await expectReadable(page.getByText(SETTLE_LABEL).first(), { timeout: 3000 });
}

// 판정 알림이 다 찬 때부터 5초(±1.5) 뒤에 왔는지 → 판정 알림 값
async function expectResolvedAfter5s(t, { since, filledAt, dayIndex = 1 }) {
    const row = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === dayIndex, timeout: 15000 });
    expect(Math.abs(row.at - filledAt - 5000), `다 찬 뒤 ${row.at - filledAt}ms에 판정`).toBeLessThanOrEqual(SLACK_MS);
    return row.payload;
}

// 다 낸 뒤 한 바퀴: 당김 알림 마감 = 다 찬 때+5초 → 화면 표시 → 5초 뒤 판정
async function expectSettled(t, page, { since, filledAt, dayIndex = 1 }) {
    const settle = await waitSettle(t, since, dayIndex);
    expect(Math.abs(settle.payload.deadline - filledAt - 5000), '당긴 마감 = 다 찬 때+5초').toBeLessThanOrEqual(SLACK_MS);
    await expectSettleUi(page);
    return expectResolvedAfter5s(t, { since, filledAt, dayIndex });
}

// ── 둘째 날 이후 ──

// 밤 차례 안내 같은 창을 닫으며 "낮이 되었습니다" 창이 뜨길 기다려 닫음 (둘째 날부터는 앞에 다른 창이 먼저 뜰 수 있음)
async function closeDayNotice(page) {
    const notice = page.getByRole('dialog', { name: '단계 전환 안내' });
    await expect(async () => {
        await ui.closeOverlays(page, { names: ['밤 역할 안내', '알림', '밤 조사 결과'] });
        await expect(notice).toContainText('낮이 되었습니다', { timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await notice.getByRole('button', { name: '확인' }).click();
    await expect(notice).toBeHidden();
}

// 밤(앞 단계)은 손잡이로 넘겨 그 날 토론까지 → 사람 화면 낮 안내 닫기 (밤엔 봇이 아무것도 안 해서 아무도 안 죽음)
async function toNextDay(t, dayIndex) {
    await t.advanceUntil((g) => g.phase === 'DAY' && g.dayIndex === dayIndex);
    for (const h of t.humans) await closeDayNotice(h.page);
}

// 재판 창에 X → X 빼고 산 봇 전원 유죄, 재판 마감은 손잡이(앞 단계) → X 처형·밤 → 밤 안내 닫음 → 현황 "재판 회부"·대상 X
async function executeByTribunal(t, page, X) {
    await expectTribunal(page, nickOf(t, X));
    const s = await t.state();
    const voters = t.bots.filter((b) => U(b) !== X && L.playerOf(s, U(b))?.alive);
    await L.botsTribunal(t, 'GUILTY', voters);
    await t.advance();
    await L.waitState(t, (g) => g.phase === 'NIGHT' && L.playerOf(g, X)?.alive === false, { timeout: 30000 });
    // 처형 영상이 끝나야 밤 안내가 뜸
    await expect(page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('밤이 되었습니다', { timeout: 40000 });
    await L.closeNotice(page, '밤이 되었습니다');
    await expectStatus(page, 'TRIBUNAL', { target: nickOf(t, X) });
}

// 그 날 산 사람 uuid (사람 + 봇)
async function aliveVoters(t) {
    const s = await t.state();
    return s.players.filter((p) => p.alive).map((p) => p.uuid);
}

// 그 날 표 모양대로 봇 먼저, 사람이 마지막 → 다 찬 시각
async function voteDay(t, list, mine) {
    const me = U(t.humans[0]);
    const plan = assignBallots(await aliveVoters(t), list, { [me]: mine });
    await castBots(t, plan);
    return castHuman(t, t.humans[0].page, mine);
}

test('A03-E-199 PC 7명 판 1일 표 낸 사람의 2일 화면에 낸 표시 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 7);
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    await L.toDay(t);
    const day1 = await openVote(t);
    await voteDay(t, ballots([[X, 3], [Y, 3]], 1), X);
    await eventRow(t.bots[0], 'day_vote_resolved', { since: day1.since, match: (p) => p.dayIndex === 1 });
    await expectNight(user.page, 'TIE');
    await toNextDay(t, 2);
    await openVote(t, { dayIndex: 2 });
    // 기권 단추가 다시 켜짐, 1일에 찍은 X 카드 메뉴도 "투표취소" 아닌 "투표하기"
    await expect(user.page.getByRole('button', { name: '기권' })).toBeEnabled();
    await L.card(user.page, nickOf(t, X)).click();
    const menu = user.page.getByRole('menu', { name: '플레이어 행동' });
    await expect(menu.getByRole('menuitem', { name: '투표하기' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '투표취소' })).toHaveCount(0);
});

test('A03-E-201 PC 7명 판 1일 5초 뒤 2일 다 내면 다시 "[5초 뒤 마감]"·5초 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await openTable(table, user, 7);
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    const shape = ballots([[X, 3], [Y, 3]], 1);
    await L.toDay(t);
    const day1 = await openVote(t);
    const filled1 = await voteDay(t, shape, X);
    expect((await expectSettled(t, user.page, { since: day1.since, filledAt: filled1 })).outcome).toBe('TIE');
    await expectNight(user.page, 'TIE');
    await toNextDay(t, 2);
    const day2 = await openVote(t, { dayIndex: 2 });
    const filled2 = await voteDay(t, shape, X);
    // 한 단계에 한 번 당김은 날마다 새로 셈
    expect((await expectSettled(t, user.page, { since: day2.since, filledAt: filled2, dayIndex: 2 })).outcome).toBe('TIE');
    await expectNight(user.page, 'TIE');
});

test('A03-E-203 PC 8명 판 1일 재판·2일 기권 많음·3일 동점 → 날마다 현황 결과 맞음 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const t = await openTable(table, user, 8);
    const page = user.page;
    const [, , X1, X2, Y2] = t.bots.map(U);
    await L.toDay(t);
    // 1일: X1 몰표(X1은 기권) → 재판 → 처형 → 현황 "재판 회부"
    await openVote(t);
    await voteDay(t, ballots([[X1, 7]], 1), X1);
    await executeByTribunal(t, page, X1);
    // 2일 (산 7): 사람만 X2, 봇 6 기권 → 기권 많음 밤
    await toNextDay(t, 2);
    await openVote(t, { dayIndex: 2 });
    await voteDay(t, ballots([[X2, 1]], 6), X2);
    await expectNight(page, 'ABSTAIN_MAJORITY', { abstain: 6 });
    // 3일 (산 7): X2 3·Y2 3·기권 1 → 동점 밤
    await toNextDay(t, 3);
    await openVote(t, { dayIndex: 3 });
    await voteDay(t, ballots([[X2, 3], [Y2, 3]], 1), X2);
    await expectNight(page, 'TIE', { abstain: 1 });
});

test('A03-E-204 PC 6명 판 1일 동점 밤 → 2일 투표 정상 (몰표 → 재판 창) @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 6);
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    await L.toDay(t);
    await openVote(t);
    await voteDay(t, ballots([[X, 3], [Y, 3]]), X);
    await expectNight(user.page, 'TIE', { abstain: 0 });
    await toNextDay(t, 2);
    const day2 = await openVote(t, { dayIndex: 2 });
    await voteDay(t, ballots([[X, 5]], 1), X);
    const resolved = await eventRow(t.bots[0], 'day_vote_resolved', { since: day2.since, match: (p) => p.dayIndex === 2 });
    expect(resolved.payload.outcome).toBe('TRIBUNAL');
    await expectTribunal(user.page, nickOf(t, X));
});

test('A03-E-205 [버그 9] PC 8명 판 2일 (산 7) 1표 6기권 → 재판 창 안 뜨고 밤 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await openTable(table, user, 8);
    const [, , X1, X2] = t.bots.map(U);
    await L.toDay(t);
    await openVote(t);
    await voteDay(t, ballots([[X1, 7]], 1), X1);
    await executeByTribunal(t, user.page, X1);
    await toNextDay(t, 2);
    expect((await aliveVoters(t)).length, '2일 산 사람').toBe(7);
    const day2 = await openVote(t, { dayIndex: 2 });
    await voteDay(t, ballots([[X2, 1]], 6), X2);
    const resolved = await eventRow(t.bots[0], 'day_vote_resolved', { since: day2.since, match: (p) => p.dayIndex === 2 });
    expect(resolved.payload.outcome).toBe('ABSTAIN_MAJORITY');
    await expectNight(user.page, 'ABSTAIN_MAJORITY', { abstain: 6 });
});

test('A03-E-206 PC 6명 판 1일 "[5초 뒤 마감]" → 2일 투표 시작 때 그 표시 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 6);
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    await L.toDay(t);
    const day1 = await openVote(t);
    const filled = await voteDay(t, ballots([[X, 3], [Y, 3]]), X);
    await expectSettled(t, user.page, { since: day1.since, filledAt: filled });
    await expectNight(user.page, 'TIE');
    await toNextDay(t, 2);
    await openVote(t, { dayIndex: 2 });
    await expect(user.page.getByText(SETTLE_LABEL)).toHaveCount(0);
    await expect(user.page.locator('[data-ingame-phase-settle]')).toHaveCount(0);
});

test('A03-E-208 PC 같은 방 두 번째 판 (5명) 첫 낮 다 내면 5초·결과 @game @realtime', async ({ user, table }) => {
    test.setTimeout(300_000);
    // 첫 판은 봇 표로 광대 처형 → 시민 승 → 결과 화면 (견본과 같은 도우미)
    const { t } = await playToResult({ user, table, kind: 'citizenWin' });
    await t.stopBots();
    const firstGameId = t.gameId;
    // 같은 방으로: 봇은 "대기방으로" 요청, 사람은 결과 화면 단추
    for (const bot of t.bots) {
        const r = await bot.request('return_to_room', { gameId: firstGameId });
        expect(r?.ok, `봇 대기방으로 거절: ${r?.code}`).toBe(true);
    }
    await user.page.getByRole('button', { name: '대기방으로' }).click();
    await expect(user.page).toHaveURL(/\/game-matching/);
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(U(user)); return room?.players?.length ?? 0; }, { message: '다섯 다 앉음' }).toBe(5);
    // 같은 방 = 같은 방 코드 (판 끝에 서버가 같은 코드·설정으로 대기방을 새로 엶, 방 id는 새것 — 결정 2026-11-16 "대기방으로 — 방 코드", backend returnRoom.js)
    expect(room.roomCode, '같은 방 코드').toBe(t.room.roomCode);
    const host = t.bots.find((b) => U(b) === room.hostUuid);
    expect(host, '방장이 봇').toBeTruthy();

    // 둘째 판: 직업 다시 정하고 시작
    const roles = rolesFor(5)({ humans: [user], bots: t.bots });
    for (const bot of t.bots) await bot.setReady(room.roomId, room.settingsVersion);
    await ui.readyUi(user.page);
    await e2e.setRoles(roles, { roomId: room.roomId });
    const started = await host.startGame(room.roomId, room.settingsVersion);
    expect(started.gameId).not.toBe(firstGameId);
    t.gameId = started.gameId;
    await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    const s = await t.state();
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(roles[p.uuid]);

    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    await L.toDay(t);
    const day1 = await openVote(t);
    const filled = await voteDay(t, ballots([[X, 2], [Y, 2]], 1), X);
    expect((await expectSettled(t, user.page, { since: day1.since, filledAt: filled })).outcome).toBe('TIE');
    await expectNight(user.page, 'TIE', { abstain: 1 });
});
