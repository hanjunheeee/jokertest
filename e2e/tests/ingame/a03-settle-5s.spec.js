'use strict';

// 다 내면 5초 뒤 판정 브라우저 시험 (PC) — 시간 줄 "[5초 뒤 마감]"·남은 초 5 이하, 5초(±1.5) 뒤 결과, 안 찬 때는 원래 마감
// 목록 A03-낮투표.md 번호 A03-E-067~072·079·081·083·097·099·101·103·105·106·108·110·111·113~115 — 5초 규칙이라 손잡이로 안 넘기고 진짜로 기다림(@realtime)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const L = require('./a-day/_lib');

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

// 그 날 낮 당김 알림이 한 번도 안 왔는지
const settleCount = (t, since, dayIndex = 1) => t.bots[0].events
    .filter((r) => r.event === 'phase_settle_started' && r.at >= since && r.payload.phase === 'DAY' && r.payload.dayIndex === dayIndex).length;

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

// 아직 안 찬 상태 확인: ms 동안 진짜로 기다린 뒤에도 당김 알림·"[5초 뒤 마감]" 없고 투표 그대로
async function expectStillOpen(t, page, { since, ms, dayIndex = 1 }) {
    await sleep(ms);
    expect(settleCount(t, since, dayIndex), '당김 알림 수').toBe(0);
    await expect(page.getByText(SETTLE_LABEL)).toHaveCount(0);
    const s = await t.state();
    expect(`${s.phase}/${s.dayPhase}`).toBe('DAY/DAY_VOTE');
}

// 다 안 찬 채 원래 마감에 판정: 당김 알림·표시 없이 투표 마감(±1.5초)에 판정 → 판정 알림 값
async function expectResolvedAtDeadline(t, { since, deadline, dayIndex = 1 }) {
    const row = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === dayIndex, timeout: Math.max(0, deadline - Date.now()) + 15000 });
    expect(Math.abs(row.at - deadline), `마감과 ${row.at - deadline}ms 차이`).toBeLessThanOrEqual(SLACK_MS);
    expect(settleCount(t, since, dayIndex), '당김 알림 수').toBe(0);
    return row.payload;
}

// 몰표 모양 (나머지 전원 X, X는 Y) → 사람마다 표, 사람은 X (X = 셋째 봇, Y = 넷째 봇)
function landslide(t, me) {
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    return { X, plan: assignBallots([me, ...t.bots.map(U)], ballots([[X, t.bots.length], [Y, 1]]), { [me]: X }) };
}

// 동점 모양 [X 표, Y 표, 기권] (최다가 기권보다 많음) → 사람마다 표, 사람은 X
function tie(t, me, [x, y, a]) {
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    return { X, plan: assignBallots([me, ...t.bots.map(U)], ballots([[X, x], [Y, y]], a), { [me]: X }) };
}

// A03-E-067~072: 인원 5~10, 사람이 마지막 표
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    const id = `A03-E-${String(67 + i).padStart(3, '0')}`;
    const smoke = i === 0 ? ' @smoke' : '';
    test(`${id} PC ${n}명 판 사람이 마지막 표 → 시간 줄 "[5초 뒤 마감]"·남은 초 5 이하, 5초 뒤 결과 @game @realtime${smoke}`, async ({ user, table }) => {
        const t = await openTable(table, user, n);
        const me = U(user);
        const { X, plan } = landslide(t, me);
        await L.toDay(t);
        const { since } = await openVote(t);
        await castBots(t, plan);
        const filledAt = await castHuman(t, user.page, plan.get(me));
        const resolved = await expectSettled(t, user.page, { since, filledAt });
        expect(resolved.outcome).toBe('TRIBUNAL');
        await expectTribunal(user.page, nickOf(t, X));
    });
});

// A03-E-079·081·083: 7명 판 투표 30초, 다 찬 때 남은 10·7·3초 (같은 줄 모바일 080·082·084는 mobile/a03-settle-5s 몫)
[[79, 10], [81, 7], [83, 3]].forEach(([no, left]) => {
    const id = `A03-E-${String(no).padStart(3, '0')}`;
    const after = left > 5 ? '"[5초 뒤 마감]"·5초 뒤 판정' : '표시 없이 원래 마감(3초 뒤) 판정';
    test(`${id} PC 7명 판 투표 30초 남은 ${left}초에 다 참 → ${after} @game @realtime`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const t = await openTable(table, user, 7);
        const me = U(user);
        const { X, plan } = landslide(t, me);
        const last = t.bots[5];
        await L.toDay(t);
        const { since, deadline } = await openVote(t);
        // 사람·봇 다섯 먼저, 마지막 봇은 마감 left초 전에 (그 순간을 진짜 시계로 기다림)
        await castHuman(t, user.page, plan.get(me));
        await castBots(t, plan, t.bots.filter((b) => b !== last));
        await sleep(deadline - left * 1000 - Date.now());
        await castBots(t, plan, [last]);
        const filledAt = Date.now();
        expect(Math.abs(deadline - filledAt - left * 1000), '다 찬 때 남은 시간').toBeLessThanOrEqual(700);

        if (left > 5) {
            const resolved = await expectSettled(t, user.page, { since, filledAt });
            expect(resolved.outcome).toBe('TRIBUNAL');
        } else {
            // 남은 시간이 5초보다 짧으면 안 당김 → 표시 없음, 원래 마감에 판정
            await sleep(1000);
            await expect(user.page.getByText(SETTLE_LABEL)).toHaveCount(0);
            const resolved = await expectResolvedAtDeadline(t, { since, deadline });
            expect(resolved.outcome).toBe('TRIBUNAL');
        }
        await expectTribunal(user.page, nickOf(t, X));
    });
});

// 6명 판 한 명 빼고 다 냄: X 3(사람·봇1·봇3)·기권 2(봇0·봇2=X), 봇4는 안 냄
// 안 낸 표가 마감 때 기권이면 3:3이라 재판 없음 (기권으로 안 세면 3:2로 재판 → 갈림)
function oneMissing(t, me) {
    const [b0, b1, X, b3] = t.bots.map(U);
    return { plan: new Map([[me, X], [b1, X], [b3, X], [b0, null], [X, null]]), missing: t.bots[4] };
}

test('A03-E-097 PC 6명 판 봇 1 안 냄 → "[5초 뒤 마감]" 안 뜸, 투표 30초 끝에 판정, 안 낸 표는 기권 칸에 @game @realtime', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 6);
    const { plan } = oneMissing(t, U(user));
    await L.toDay(t);
    const { since, deadline } = await openVote(t);
    await castBots(t, plan);
    await castHuman(t, user.page, plan.get(U(user)));
    // 5초 넘게 기다려도 당김 없음
    await expectStillOpen(t, user.page, { since, ms: 6500 });
    const resolved = await expectResolvedAtDeadline(t, { since, deadline });
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    await expectNight(user.page, 'ABSTAIN_MAJORITY', { abstain: 3 });
});

test('A03-E-099 PC 6명 판 안 낸 봇 1이 끊김(60초 안) → 다 찬 것 아님, 원래 마감에 판정 @game @realtime', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 6);
    const { plan, missing } = oneMissing(t, U(user));
    await L.toDay(t);
    const { since, deadline } = await openVote(t);
    // 끊긴 사람은 60초 기다림 중이라 산 사람 그대로 → 그 표는 마감 때 기권
    missing.socket.disconnect();
    await castBots(t, plan);
    await castHuman(t, user.page, plan.get(U(user)));
    await expectStillOpen(t, user.page, { since, ms: 6500 });
    const resolved = await expectResolvedAtDeadline(t, { since, deadline });
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    await expectNight(user.page, 'ABSTAIN_MAJORITY', { abstain: 3 });
});

test('A03-E-101 PC 7명 판 안 낸 봇 1이 판을 나감 → 남은 사람 다 냄 → 나간 때부터 5초 뒤 판정 @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 7);
    const me = U(user);
    const [b0, b1, X, b3, b4] = t.bots.map(U);
    const leaver = t.bots[5];
    // X 4(사람·봇0·봇1·봇3)·기권 2(봇2=X·봇4), 봇5는 안 내고 나감
    const plan = new Map([[me, X], [b0, X], [b1, X], [b3, X], [X, null], [b4, null]]);
    await L.toDay(t);
    const { since } = await openVote(t);
    await castBots(t, plan);
    await castHuman(t, user.page, X);
    await expectStillOpen(t, user.page, { since, ms: 1500 });
    const left = await leaver.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `나가기 거절: ${left?.code}`).toBe(true);
    const filledAt = Date.now();
    const resolved = await expectSettled(t, user.page, { since, filledAt });
    expect(resolved.outcome).toBe('TRIBUNAL');
    await expectTribunal(user.page, nickOf(t, X));
});

// 5초 중 새로고침 → 화면이 판 값을 다시 받아 그림 (연출 창은 닫고, 접힌 시간 바는 펼쳐 시계가 보일 때까지 — 5초 안에 끝나게 짧게)
async function reloadIngame(page) {
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/);
    await expect(async () => {
        await ui.closeOverlays(page, { clickTimeoutMs: 500 });
        const expand = page.getByRole('button', { name: '시간흐름바 확대' });
        if (await expand.isVisible()) await expand.click({ timeout: 500 });
        expect(await timerSec(page), '시계 보임').not.toBeNull();
    }).toPass({ timeout: 4000 });
}

test('A03-E-103 PC 6명 판 5초 중 새로고침 → 남은 초가 5 이하로 이어짐 @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const me = U(user);
    const { plan } = tie(t, me, [3, 3, 0]);
    await L.toDay(t);
    const { since } = await openVote(t);
    await castBots(t, plan);
    const filledAt = await castHuman(t, user.page, plan.get(me));
    await waitSettle(t, since);
    await reloadIngame(user.page);
    // 새로 받은 판 값도 당긴 마감 → 30초로 돌아가지 않음 ("[5초 뒤 마감]" 글이 다시 뜨는지는 결정 대기 4라 안 봄)
    await expect.poll(async () => (await timerSec(user.page)) ?? 99, { timeout: 4000, message: '새로고침 뒤 남은 초' }).toBeLessThanOrEqual(5);
    const resolved = await expectResolvedAfter5s(t, { since, filledAt });
    expect(resolved.outcome).toBe('TIE');
});

test('A03-E-105 PC 8명 판 5초 중 새로고침 → 새로고침한 화면도 판정 뒤 현황 결과 "동점" @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 8);
    const me = U(user);
    const { plan } = tie(t, me, [4, 4, 0]);
    await L.toDay(t);
    const { since } = await openVote(t);
    await castBots(t, plan);
    const filledAt = await castHuman(t, user.page, plan.get(me));
    await waitSettle(t, since);
    await reloadIngame(user.page);
    const resolved = await expectResolvedAfter5s(t, { since, filledAt });
    expect(resolved.outcome).toBe('TIE');
    // 새로고침이 판정 뒤에 끝나도 결과가 보여야 함 (결정 2026-11-16 아침 4번 — 모음 글 C-006, 아직 코드에 없음)
    await expect(user.page.getByRole('dialog', { name: '재판' })).toHaveCount(0);
    await expectStatus(user.page, 'TIE', { abstain: 0 });
});

test('A03-E-106 PC 7명 판 2일 사람이 죽음 → 산 사람 다 냄 → 죽은 사람 화면에도 "[5초 뒤 마감]"·결과 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await openTable(table, user, 7);
    const me = U(user);
    const page = user.page;
    // 1일 (앞 단계): 봇 6이 사람을 찍고 사람은 기권 → 재판 → 봇 전원 유죄 → 사람 처형 (사람은 시민이라 판 계속)
    await L.toDay(t);
    const day1 = await openVote(t);
    await castBots(t, new Map(t.bots.map((b) => [U(b), me])));
    await castHuman(t, page, null);
    await eventRow(t.bots[0], 'day_vote_resolved', { since: day1.since, match: (p) => p.dayIndex === 1 && p.outcome === 'TRIBUNAL' });
    await L.waitState(t, (g) => g.phase === 'TRIBUNAL');
    await L.botsTribunal(t, 'GUILTY');
    await L.keepWatching(page);
    await L.waitState(t, (g) => g.phase === 'NIGHT' && L.playerOf(g, me)?.alive === false, { timeout: 30000 });
    // 밤은 앞 단계라 손잡이로 넘김, 죽은 사람 화면의 단계 안내는 저절로 닫힘
    await t.advanceUntil((g) => g.phase === 'DAY' && g.dayIndex === 2);
    await expect(page.getByRole('dialog', { name: '단계 전환 안내' })).toHaveCount(0, { timeout: 15000 });

    // 2일: 산 봇 6 동점 X 3·Y 3, 마지막 봇이 낸 때부터 5초
    const day2 = await openVote(t, { dayIndex: 2, alivePages: [] });
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    await castBots(t, assignBallots(t.bots.map(U), ballots([[X, 3], [Y, 3]])));
    const filledAt = Date.now();
    const resolved = await expectSettled(t, page, { since: day2.since, filledAt, dayIndex: 2 });
    expect(resolved.outcome).toBe('TIE');
    await expectStatus(page, 'TIE');
});

test('A03-E-108 PC 5명 판 모두 기권으로 다 참 → 5초 뒤 밤, 현황 "전원 기권" @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 5);
    await L.toDay(t);
    const { since } = await openVote(t);
    await castBots(t, new Map(t.bots.map((b) => [U(b), null])));
    const filledAt = await castHuman(t, user.page, null);
    const resolved = await expectSettled(t, user.page, { since, filledAt });
    expect(resolved.outcome).toBe('ABSTAINED');
    await expectNight(user.page, 'ABSTAINED', { abstain: 5 });
});

test('A03-E-110 PC 8명 판 마지막 표가 사람 → 5초 @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 8);
    const { X, plan } = landslide(t, U(user));
    await L.toDay(t);
    const { since } = await openVote(t);
    await castBots(t, plan);
    const filledAt = await castHuman(t, user.page, X);
    const resolved = await expectSettled(t, user.page, { since, filledAt });
    expect(resolved.outcome).toBe('TRIBUNAL');
});

test('A03-E-111 PC 8명 판 마지막 표가 봇 → 5초 @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 8);
    const { X, plan } = landslide(t, U(user));
    await L.toDay(t);
    const { since } = await openVote(t);
    await castHuman(t, user.page, X);
    await castBots(t, plan);
    const filledAt = Date.now();
    const resolved = await expectSettled(t, user.page, { since, filledAt });
    expect(resolved.outcome).toBe('TRIBUNAL');
});

test('A03-E-113 PC 10명 판 투표 90초, 열리자마자 다 냄 → 5초 뒤 판정 (90초 안 기다림) @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 10, { dayVoteTime: 90 });
    const { X, plan } = landslide(t, U(user));
    await L.toDay(t);
    const { since, deadline } = await openVote(t);
    // 봇 9는 한꺼번에, 사람도 바로
    await Promise.all([...t.bots.map((b) => castBots(t, plan, [b])), castHuman(t, user.page, X)]);
    const filledAt = Date.now();
    expect(deadline - filledAt, '다 찬 때 남은 시간').toBeGreaterThan(80_000);
    const resolved = await expectSettled(t, user.page, { since, filledAt });
    expect(resolved.outcome).toBe('TRIBUNAL');
});

test('A03-E-114 PC 6명 판 5초 중 사람이 채팅 → 채팅 칸에 보임 @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const me = U(user);
    const { plan } = tie(t, me, [3, 3, 0]);
    await L.toDay(t);
    const { since } = await openVote(t);
    await castBots(t, plan);
    const filledAt = await castHuman(t, user.page, plan.get(me));
    await waitSettle(t, since);
    const text = `오초채팅${Date.now() % 100000}`;
    await L.sendChatOk(user.page, text);
    await expectReadable(L.chatLog(user.page).getByText(text).first());
    // 채팅이 판정 전(5초 안)에 판에 퍼졌는지, 판정은 그대로 5초 뒤
    const chatRow = await eventRow(t.bots[0], 'day_chat_message_received', { since, match: (p) => JSON.stringify(p).includes(text) });
    const resolved = await expectResolvedAfter5s(t, { since, filledAt });
    expect(chatRow.at, '판정 전에 채팅이 감').toBeLessThan(filledAt + 5000);
    expect(resolved.outcome).toBe('TIE');
});

test('A03-E-115 PC 6명 판 5초 중 현황 창 → "집계 전" @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const me = U(user);
    const { plan } = tie(t, me, [3, 3, 0]);
    await L.toDay(t);
    const { since } = await openVote(t);
    await castBots(t, plan);
    const filledAt = await castHuman(t, user.page, plan.get(me));
    await waitSettle(t, since);
    const status = await openStatus(user.page);
    const unresolved = status.getByTestId('vote-status-unresolved');
    await expect(unresolved).toHaveText('집계 전');
    await expectReadable(unresolved, { timeout: 3000 });
    // 본 때가 판정 전이었는지 (판정 알림이 아직 안 옴)
    expect(t.bots[0].events.some((r) => r.event === 'day_vote_resolved' && r.at >= since), '이미 판정됨').toBe(false);
    const resolved = await expectResolvedAfter5s(t, { since, filledAt });
    expect(resolved.outcome).toBe('TIE');
});
