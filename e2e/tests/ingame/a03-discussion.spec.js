'use strict';

// 낮 토론·준비 브라우저 시험 (PC) — "낮이 되었습니다" 창·전원 준비면 바로 투표·준비 단추·토론/투표 시간 설정·150자·0.5초·투표 중 채팅
// 목록 A03-낮투표.md 번호 A03-E-160~197 중 PC 몫(160·162·164~166·169·171·173·175·177~185 홀수·187~191 홀수·193·195·197)
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable, readability } = require('../../helpers/visible');
const L = require('./a-day/_lib');

const U = (x) => x.account.uuid;
const rand = () => Math.random().toString(36).slice(2, 7);

// 직업 전부 정함: 사람 시민, 첫 봇 광대, 나머지 시민 (직접 구성 광대 1 — 밤 차례가 광대뿐이라 날 넘기기가 단순)
function rolesFor() {
    return ({ humans, bots }) => {
        const out = { [U(humans[0])]: 'CITIZEN' };
        bots.forEach((b, i) => { out[U(b)] = i === 0 ? 'JOKER' : 'CITIZEN'; });
        return out;
    };
}

// n명 판 (사람 1 + 봇 n-1) 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user, n, settings = {}) {
    const roles = rolesFor();
    const t = await table.setup({ humans: [user], bots: n - 1, settings: { ...customRoleSettings({ JOKER: 1 }), ...settings }, roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(s.players).toHaveLength(n);
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(want[p.uuid]);
    return t;
}

// 봇이 받은 알림 한 줄 기다림 → { event, payload, at(받은 시각) }
async function eventRow(bot, event, { since = 0, match = () => true, timeout = 20000 } = {}) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 접힌 시간 바를 펼쳐 남은 시간(타이머) 보이게 → 남은 초
async function readTimer(page) {
    const expand = page.getByRole('button', { name: '시간흐름바 확대' });
    if (await expand.isVisible().catch(() => false)) await expand.click();
    await expect(page.getByRole('timer').first()).toBeVisible();
    const sec = await L.timerSeconds(page);
    expect(sec, '타이머 mm:ss 글').not.toBeNull();
    return sec;
}

// 단계 전환 안내 창 중 text가 든 창까지 (그 앞 다른 안내·밤 차례 안내·알림 창은 닫음), close면 그 창도 닫음
async function reachNotice(page, text, { close = true, timeout = 40000 } = {}) {
    const notice = page.getByRole('dialog', { name: '단계 전환 안내', exact: true });
    await expect.poll(async () => {
        await ui.closeOverlays(page, { names: ['밤 역할 안내', '알림'], keepWatching: false, rounds: 1 });
        if (!(await notice.isVisible().catch(() => false))) return false;
        const shown = await notice.innerText().catch(() => '');
        if (shown.includes(text) && !close) return true;
        await notice.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
        return shown.includes(text);
    }, { timeout, intervals: [300], message: `"${text}" 안내 창` }).toBe(true);
    return notice;
}

// 1일 낮 표·재판으로 victim 처형 → 밤 → 2일 낮 토론까지 (앞 단계라 손잡이로 넘김)
// 사람이 죽으면 '사망 후 선택'에서 관전 계속, 살아 있으면 밤 안내만 닫음 (2일 "낮이 되었습니다"는 안 닫음)
async function executeThenDay2(t, page, victimUuid, { humanDies }) {
    await L.toVote(t);
    const voters = t.bots.filter((b) => U(b) !== victimUuid);
    await L.botsVote(t, voters.map((b) => [b, victimUuid]));
    const tri = await L.resolveVote(t);
    expect(tri.phase).toBe('TRIBUNAL');
    expect(tri.tribunal?.defendantUuid).toBe(victimUuid);
    await L.botsTribunal(t, voters.map((b) => [b, 'GUILTY']));
    await L.resolveTribunal(t);
    await L.waitState(t, (g) => g.players.find((p) => p.uuid === victimUuid)?.alive === false);
    if (humanDies) await L.keepWatching(page);
    else await reachNotice(page, '밤이 되었습니다');
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_DISCUSSION');
}

const readyButton = (page) => page.locator('[data-ingame-phase-action="dayReady"]');
const chatTextarea = (page) => page.locator('textarea[aria-label="채팅 입력"]');

// "낮이 되었습니다" 창이 떠 있는 동안: 준비 꺼짐·채팅 칸이 창 덮개에 가려짐 → 3초 그대로 둠(시간이 흐르나 보려고 진짜로) → 확인 → 남은 시간이 줄어 있음·준비·채팅 됨
async function expectNoticeBlocksThenOpens(page, { startedAt, total }) {
    const notice = page.getByRole('dialog', { name: '단계 전환 안내', exact: true });
    await expect(notice).toContainText('낮이 되었습니다');
    await expect(readyButton(page)).toBeDisabled();
    const chat = await readability(chatTextarea(page));
    expect(chat.covered, `채팅 칸이 안내 창에 안 가려짐: ${chat.coveredBy}`).toBe(true);

    // 창이 떠 있어도 시간은 흐르는지 보는 규칙이라 진짜로 기다림 (결-토론 "시간은 흐름")
    await page.waitForTimeout(3000);
    await notice.getByRole('button', { name: '확인' }).click();
    await expect(notice).toBeHidden();

    const sec = await readTimer(page);
    const elapsed = (Date.now() - startedAt) / 1000;
    expect(sec, '창이 떠 있는 동안 남은 시간이 안 줄어듦').toBeLessThanOrEqual(total - 3 + 1);
    expect(Math.abs(sec + elapsed - total), `남은 ${sec}초 + 지난 ${elapsed.toFixed(1)}초 ≠ ${total}초`).toBeLessThanOrEqual(2);

    await expect(readyButton(page)).toBeEnabled();
    await expectReadable(readyButton(page));
    await readyButton(page).click();
    await expect(readyButton(page)).toHaveText('준비 완료');
    const text = `낮말${rand()}`;
    await L.sendChatOk(page, text);
    await ui.expectChat(page, text);
}

test('A03-E-160 PC 6명 판 1일 "낮이 되었습니다" 창: 안 누르면 준비·채팅 못 함, 시간은 흐름, 누르면 됨 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6, { dayDiscussionTime: 60 });
    const page = user.page;
    const since = Date.now();
    await L.closeReveal(page);
    await t.advanceUntil('DAY');
    const day = await eventRow(t.bots[0], 'game_phase_changed', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1 });
    await reachNotice(page, '낮이 되었습니다', { close: false });
    await expectNoticeBlocksThenOpens(page, { startedAt: day.at, total: 60 });
});

test('A03-E-162 PC 8명 판 2일 "낮이 되었습니다" 창: 2일에도 안 누르면 준비·채팅 못 함, 시간은 흐름, 누르면 됨 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 8, { dayDiscussionTime: 60 });
    const page = user.page;
    await L.toDay(t);
    const since = Date.now();
    // 1일에 시민 봇 하나 처형 → 2일
    await executeThenDay2(t, page, U(t.bots[1]), { humanDies: false });
    const day2 = await eventRow(t.bots[0], 'night_result_applied', { since, match: (p) => p.dayIndex === 2 });
    await reachNotice(page, '낮이 되었습니다', { close: false });
    await expectNoticeBlocksThenOpens(page, { startedAt: day2.at, total: 60 });
});

// A03-E-164~166 PC 5·8·10명 판, 토론 150초 → 봇 다 준비, 사람이 마지막 준비 → 바로 투표
[[164, 5], [165, 8], [166, 10]].forEach(([no, n]) => {
    test(`A03-E-${no} PC ${n}명 판 토론 150초: 사람이 마지막으로 준비 → 바로 투표 단계 @game`, async ({ user, table }) => {
        const t = await openTable(table, user, n, { dayDiscussionTime: 150 });
        const page = user.page;
        await L.toDay(t);
        for (const bot of t.bots) {
            const r = await bot.request('ready_for_day_vote', { gameId: t.gameId });
            expect(r?.ok, `봇 준비 거절: ${r?.code}`).toBe(true);
        }
        expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
        const clickedAt = Date.now();
        await page.getByRole('button', { name: '투표 시작 준비' }).click();
        const vote = await eventRow(t.bots[0], 'day_phase_changed', { since: clickedAt, match: (p) => p.dayPhase === 'DAY_VOTE' });
        // 150초 토론 안에서 몇 초 만에 넘어가면 시간 끝이 아니라 전원 준비로 넘어간 것
        expect(vote.at - clickedAt).toBeLessThan(5000);
        await expect(page.getByRole('button', { name: '기권' })).toBeVisible();
    });
});

test('A03-E-169 PC 7명 판 토론 30초 일부만 준비(봇 1 안 함) → 30초 끝에 투표 @game @realtime', async ({ user, table }) => {
    const t = await openTable(table, user, 7, { dayDiscussionTime: 30 });
    const page = user.page;
    const since = Date.now();
    await L.toDay(t);
    const day = await eventRow(t.bots[0], 'game_phase_changed', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1 });
    // 마지막 봇 하나만 준비 안 함
    for (const bot of t.bots.slice(0, -1)) {
        const r = await bot.request('ready_for_day_vote', { gameId: t.gameId });
        expect(r?.ok, `봇 준비 거절: ${r?.code}`).toBe(true);
    }
    await page.getByRole('button', { name: '투표 시작 준비' }).click();
    await expect(readyButton(page)).toHaveText('준비 완료');
    // 손잡이 없이 토론 30초를 진짜로 기다림 (허용 폭 ±1.5초)
    const vote = await eventRow(t.bots[0], 'day_phase_changed', { since: day.at, match: (p) => p.dayPhase === 'DAY_VOTE', timeout: 45000 });
    expect(Math.abs(vote.at - day.at - 30000), `토론이 ${vote.at - day.at}ms 만에 끝남`).toBeLessThanOrEqual(1500);
    await expect(page.getByRole('button', { name: '기권' })).toBeVisible();
});

test('A03-E-171 PC 5명 판 준비 단추 글 "투표 시작 준비" → 누르면 "준비 완료" @game @smoke', async ({ user, table }) => {
    const t = await openTable(table, user, 5);
    const page = user.page;
    await L.toDay(t);
    await expect(readyButton(page)).toHaveText('투표 시작 준비');
    await expectReadable(readyButton(page));
    await readyButton(page).click();
    await expect(readyButton(page)).toHaveText('준비 완료');
    await expectReadable(page.getByText('준비 완료', { exact: true }));
});

test('A03-E-173 PC 7명 판 2일 죽은 사람 화면에 준비 단추 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 7);
    const page = user.page;
    await L.toDay(t);
    // 1일에 사람이 처형됨 → 2일 토론을 죽은 채 봄
    await executeThenDay2(t, page, U(user), { humanDies: true });
    await expect(page.locator('[aria-label="제 2일 시간 흐름"]')).toBeVisible({ timeout: 20000 });
    await expect(readyButton(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /투표 시작 준비|준비 완료/ })).toHaveCount(0);
});

test('A03-E-175 PC 6명 판 준비 안 한 봇이 판을 나감 → 나머지 다 준비하면 바로 투표 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6, { dayDiscussionTime: 150 });
    const page = user.page;
    await L.toDay(t);
    // 광대가 나가면 판이 끝나서 시민 봇이 나감
    const leaver = t.bots[t.bots.length - 1];
    const left = await leaver.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `봇 나가기 거절: ${left?.code}`).toBe(true);
    await L.waitState(t, (g) => g.players.find((p) => p.uuid === U(leaver))?.isParticipating === false);
    for (const bot of t.bots.slice(0, -1)) {
        const r = await bot.request('ready_for_day_vote', { gameId: t.gameId });
        expect(r?.ok, `봇 준비 거절: ${r?.code}`).toBe(true);
    }
    const clickedAt = Date.now();
    await page.getByRole('button', { name: '투표 시작 준비' }).click();
    const vote = await eventRow(t.bots[0], 'day_phase_changed', { since: clickedAt, match: (p) => p.dayPhase === 'DAY_VOTE' });
    expect(vote.at - clickedAt).toBeLessThan(5000);
    await expect(page.getByRole('button', { name: '기권' })).toBeVisible();
});

// A03-E-177~185 홀수 PC 토론 시간 설정 → 첫 낮 시간 줄 처음 남은 시간 (±2초)
[[177, 30, 6], [179, 60, 7], [181, 90, 8], [183, 120, 10], [185, 150, 5]].forEach(([no, sec, n]) => {
    test(`A03-E-${no} PC ${n}명 판 토론 ${sec}초 설정 → 첫 낮 시간 줄 처음 남은 시간 ${sec}초 @game`, async ({ user, table }) => {
        const t = await openTable(table, user, n, { dayDiscussionTime: sec });
        const page = user.page;
        const since = Date.now();
        await L.toDay(t);
        const day = await eventRow(t.bots[0], 'game_phase_changed', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1 });
        const shown = await readTimer(page);
        // 읽기까지 지난 시간을 더하면 처음 남은 시간
        const first = shown + (Date.now() - day.at) / 1000;
        expect(Math.abs(first - sec), `처음 남은 시간 ${first.toFixed(1)}초`).toBeLessThanOrEqual(2);
    });
});

// A03-E-187~191 홀수 PC 투표 시간 설정 → 투표 단계 처음 남은 시간 (±2초)
[[187, 30, 6], [189, 60, 8], [191, 90, 9]].forEach(([no, sec, n]) => {
    test(`A03-E-${no} PC ${n}명 판 투표 ${sec}초 설정 → 투표 단계 처음 남은 시간 ${sec}초 @game`, async ({ user, table }) => {
        const t = await openTable(table, user, n, { dayVoteTime: sec });
        const page = user.page;
        await L.toDay(t);
        const since = Date.now();
        await L.toVote(t);
        const vote = await eventRow(t.bots[0], 'day_phase_changed', { since, match: (p) => p.dayPhase === 'DAY_VOTE' });
        const shown = await readTimer(page);
        const first = shown + (Date.now() - vote.at) / 1000;
        expect(Math.abs(first - sec), `처음 남은 시간 ${first.toFixed(1)}초`).toBeLessThanOrEqual(2);
    });
});

test('A03-E-193 PC 6명 판 150자 채팅 → 그대로 보임, 151자는 보내도 안 보임 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    const tag = rand();
    const text150 = `${tag}${'가'.repeat(150 - tag.length)}`;
    const text151 = `${rand()}${'나'.repeat(146)}`;
    expect(text150).toHaveLength(150);
    expect(text151).toHaveLength(151);

    await L.sendChatOk(page, text150);
    await ui.expectChat(page, text150);
    await expectReadable(L.chatLog(page).getByText(text150).first());

    // 0.5초 간격 규칙에 안 걸리게 그 시간만큼 진짜로 둠 (151자 막힘이 간격 때문이 아니게)
    await page.waitForTimeout(600);
    // 151자째가 칸에 들어가는지는 안 봄 (모음 글 A03-F-207: 들어가고 보낼 때 막힘 — 목록을 지금 값으로)
    await ui.sendChat(page, text151);
    // 봇 말이 보일 때까지 기다리면 그 앞에 보낸 151자가 받아졌다면 이미 보였을 것
    const marker = `표시${rand()}`;
    const r = await L.botChat(t, t.bots[1], marker);
    expect(r?.ok, `봇 채팅 거절: ${r?.code}`).toBe(true);
    await ui.expectChat(page, marker);
    await expect(L.chatLog(page)).not.toContainText(text151);
});

test('A03-E-195 PC 6명 판 0.5초 안 두 번 보냄 → 하나만 보임 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    const first = `첫말${rand()}`;
    const second = `둘째${rand()}`;
    await ui.sendChat(page, first);
    await ui.sendChat(page, second);
    await ui.expectChat(page, first);
    await expectReadable(L.chatLog(page).getByText(first).first());
    const marker = `표시${rand()}`;
    const r = await L.botChat(t, t.bots[1], marker);
    expect(r?.ok, `봇 채팅 거절: ${r?.code}`).toBe(true);
    await ui.expectChat(page, marker);
    await expect(L.chatLog(page)).not.toContainText(second);
});

test('A03-E-197 PC 6명 판 투표 단계 채팅 → 보임 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const text = `투표중${rand()}`;
    await L.sendChatOk(page, text);
    await ui.expectChat(page, text);
    await expectReadable(L.chatLog(page).getByText(text).first());
});
