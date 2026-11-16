'use strict';

// 모바일 "다 내면 5초 뒤 판정" 진짜 시간 시험: 인원 5~10·남은 시간 경계·한 명 안 냄·끊김·나감·새로고침·죽은 사람·전원 기권·마지막 표가 사람
// 목록 A03-낮투표.md A03-E-073~078·080·082·084·098·100·102·104·107·109·112 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-settle-5s.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { sleep } = require('../../helpers/wait');
const { talk, startTalkGame, toDay, toVote, clearOverlays, getExecuted } = require('./_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: 모바일 낮 투표 묶음) ──

// 자동 역할 구성 (광대 1, 6명부터 의사, 8명부터 경비원, 10명부터 마녀사냥꾼, 남는 자리 시민)
function autoRoles(n) {
    const list = ['JOKER'];
    if (n >= 6) list.push('DOCTOR');
    if (n >= 8) list.push('GUARD');
    if (n >= 10) list.push('WITCH_HUNTER');
    while (list.length < n) list.push('CITIZEN');
    return list;
}

// 봇 직업 차례: 시민 먼저·광대 마지막 → 봇 0·1(X·Y)은 늘 시민이라 재판·퇴장에도 판이 안 끝남
const BOT_ORDER = ['CITIZEN', 'WITCH_HUNTER', 'GUARD', 'DOCTOR', 'JOKER'];

// 직업 고정 계획: 사람은 받은 직업(기본 시민), 남은 직업을 봇에 → { uuid: 직업 }
function rolePlan(n, humanRoles = []) {
    return ({ humans, bots }) => {
        const pool = autoRoles(n);
        const out = {};
        humans.forEach((h, i) => {
            const role = humanRoles[i] ?? 'CITIZEN';
            if (!pool.includes(role)) throw new Error(`${n}명 자동 구성에 ${role} 자리 없음`);
            pool.splice(pool.indexOf(role), 1);
            out[h.account.uuid] = role;
        });
        pool.sort((a, b) => BOT_ORDER.indexOf(a) - BOT_ORDER.indexOf(b));
        bots.forEach((b, i) => { out[b.account.uuid] = pool[i]; });
        return out;
    };
}

// 서버가 정한 직업이 계획과 같은지 (예약이 가끔 못 맞음)
async function expectRoles(t, plan) {
    const want = plan({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(Object.fromEntries(s.players.map((p) => [p.uuid, p.role]))).toEqual(want);
}

// 판 차리고 제 1일 낮 투표까지 (역할 공개·토론은 이 시험이 보는 규칙이 아니라 손잡이로 빨리)
async function openVote(table, user, n, { humanRoles, settings } = {}) {
    const roles = rolePlan(n, humanRoles);
    const t = await startTalkGame(table, user, { bots: n - 1, roles, settings });
    await expectRoles(t, roles);
    await toDay(t, user.page);
    await toVote(t, user.page);
    return t;
}

// uuid → 닉네임
async function namesOf(t) {
    const s = await t.state();
    return new Map(s.players.map((p) => [p.uuid, p.nickname]));
}

const uuidOf = (who) => who.account.uuid;

const abstainButton = (page) => page.getByRole('button', { name: '기권' });

const sheetOf = (page) => page.locator('[data-ingame-player-card-menu]');

// 초상 띠 칸을 눌러 그 사람 카드 시트 열기
async function openSheet(page, nick) {
    await talk.slot(page, nick).click();
    const sheet = sheetOf(page);
    await expect(sheet).toHaveAttribute('aria-label', nick);
    return sheet;
}

// 사람 표: null이면 기권 단추, 아니면 그 사람 카드 '투표하기' → 기권 단추가 꺼지면 서버가 받은 것
async function castMine(page, target, names) {
    if (target === null) {
        await abstainButton(page).click();
    } else {
        const sheet = await openSheet(page, names.get(target));
        await sheet.getByRole('menuitem', { name: '투표하기' }).click();
        await expect(sheet).toBeHidden();
    }
    await expect(abstainButton(page)).toBeDisabled();
}

// 봇 표 (계획에 있는 봇만, 서버 답 ok까지)
async function castBots(t, plan, bots = t.bots) {
    for (const bot of bots) {
        if (!plan.has(uuidOf(bot))) continue;
        const reply = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: plan.get(uuidOf(bot)) });
        expect(reply?.ok, `봇 낮 표 거절: ${reply?.code}`).toBe(true);
    }
}

// 표 나누기: order 차례로 X에 x표, Y에 y표, 나머지 기권 (자기는 못 찍어 X는 Y·기권, Y는 X·기권)
// 예: allocate([나, X, Y, 봇2], X, Y, { x: 2, y: 1 }) → 나→X, X→Y, Y→X, 봇2→기권
function allocate(order, X, Y, { x = 0, y = 0 }) {
    const need = { x, y };
    const plan = new Map();
    for (const v of order) {
        if (v !== X && need.x > 0) { need.x -= 1; plan.set(v, X); }
        else if (Y && v !== Y && need.y > 0) { need.y -= 1; plan.set(v, Y); }
        else plan.set(v, null);
    }
    if (need.x > 0 || need.y > 0) throw new Error(`표 나누기 실패 (남은 X ${need.x}·Y ${need.y})`);
    return plan;
}

// 투표 현황 창 열기 → 창
async function openStatus(page) {
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    await expect(panel).toBeVisible();
    return panel;
}

// 결과 값 → 화면 글 (결-투표·결-버그9 화면 문구)
const OUTCOME_TEXT = Object.freeze({
    TRIBUNAL: '재판 회부',
    TIE: '동점',
    ABSTAIN_MAJORITY: '기권이 많아 재판 없음',
    ABSTAINED: '전원 기권',
});

// 판정 뒤 화면: 현황 결과 글 + 재판이면 재판 창(피고 이름), 밤이면 밤 안내·재판 창 없음
async function expectOutcome(page, panel, kind, targetNick) {
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText(OUTCOME_TEXT[kind], { timeout: 15_000 });
    const tribunal = page.locator('[data-ingame-tribunal-presentation]');
    if (kind === 'TRIBUNAL') {
        await expect(tribunal).toBeVisible();
        await expect(tribunal).toContainText(targetNick);
        return;
    }
    await expect(page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('밤이 되었습니다');
    await expect(tribunal).toHaveCount(0);
}

// 단계 줄 남은 초 ("제 1일 · 5초 뒤 마감 0:04" → 4, 시계 없으면 null)
async function phaseClock(page) {
    const text = await talk.phaseLine(page).innerText({ timeout: 2_000 });
    const m = /(\d+):(\d{2})/.exec(text);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 봇이 받은 사건 하나 + 받은 시각 (since 뒤 것만)
async function eventAt(bot, event, { since = 0, match = () => true, timeoutMs = 40_000 } = {}) {
    const payload = await bot.waitForEvent(event, { since, match, timeoutMs });
    const row = bot.events.find((r) => r.payload === payload);
    return { payload, at: row?.at ?? Date.now() };
}

// 다 찬 판정: 마지막 표 직전 시각(fullAt) 뒤 곧바로 당김(3초 안 — 누르기가 서버에 닿는 시간), 당김 알림부터 마감·판정 알림이 5초(±1.5) 뒤 → 판정 값
// 5초는 서버가 다 찬 걸 안 때(당김 알림)부터 잼: 사파리 누르기가 느린 날 그 시간이 5초에 섞여 흔들렸음(A03-E-104)
async function expectFiveSeconds(watcher, fullAt, day) {
    const settle = await eventAt(watcher, 'phase_settle_started', { since: fullAt, match: (p) => p.phase === 'DAY' && p.dayIndex === day });
    const resolved = await eventAt(watcher, 'day_vote_resolved', { since: fullAt, match: (p) => p.dayIndex === day });
    expect(settle.at - fullAt).toBeLessThanOrEqual(3_000);
    expect(settle.payload.deadline - settle.at).toBeGreaterThanOrEqual(3_500);
    expect(settle.payload.deadline - settle.at).toBeLessThanOrEqual(6_500);
    expect(resolved.at - settle.at).toBeGreaterThanOrEqual(3_500);
    expect(resolved.at - settle.at).toBeLessThanOrEqual(6_500);
    return resolved.payload;
}

// 투표 마감 시각 (투표 단계 알림에 실린 값)
async function voteDeadline(bot, day) {
    const p = await bot.waitForEvent('day_phase_changed', { match: (x) => x.dayPhase === 'DAY_VOTE' && x.dayIndex === day });
    return p.dayPhaseDeadline;
}

// 마감 판정: 당김 알림 없이 원래 마감(±1.5초)에 판정 → 판정 값
async function expectAtDeadline(watcher, deadline, day) {
    const resolved = await eventAt(watcher, 'day_vote_resolved', {
        match: (p) => p.dayIndex === day, timeoutMs: Math.max(0, deadline - Date.now()) + 20_000,
    });
    expect(Math.abs(resolved.at - deadline)).toBeLessThanOrEqual(1_500);
    const pulled = watcher.events.filter((r) => r.event === 'phase_settle_started' && r.payload?.phase === 'DAY' && r.payload?.dayIndex === day);
    expect(pulled, '마감 당김 알림이 오면 안 됨').toHaveLength(0);
    return resolved.payload;
}

// 봇 표를 마지막 하나만 남기고 낸 뒤 마지막 봇 표 → 그 직전 시각(다 찬 때)
async function castBotsLast(t, plan) {
    const voters = t.bots.filter((b) => plan.has(uuidOf(b)));
    await castBots(t, plan, voters.slice(0, -1));
    const fullAt = Date.now();
    await castBots(t, plan, voters.slice(-1));
    return fullAt;
}

// 몰표 모양에서 사람이 마지막 표: 봇이 먼저 다 내고, 사람이 X 카드 '투표하기'를 누르는 순간이 다 찬 때
async function humanLastMass(t, user, { atRemainingMs = null, deadline = null } = {}) {
    const names = await namesOf(t);
    const n = t.humans.length + t.bots.length;
    const [X, Y] = t.bots.map(uuidOf);
    const plan = allocate([X, Y, ...t.bots.slice(2).map(uuidOf), uuidOf(user)], X, Y, { x: n - 1, y: 1 });
    await castBots(t, plan);
    // 남은 시간 경계 케이스는 그 시각까지 진짜로 기다렸다 누름
    if (atRemainingMs !== null) await sleep(Math.max(0, deadline - atRemainingMs - 1_500 - Date.now()));
    const sheet = await openSheet(user.page, names.get(X));
    if (atRemainingMs !== null) await sleep(Math.max(0, deadline - atRemainingMs - Date.now()));
    const fullAt = Date.now();
    await sheet.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(sheet).toBeHidden();
    return { names, X, fullAt };
}

// 당김 보임: 단계 줄에 "5초 뒤 마감"·남은 초 5 이하
async function expectSettleLine(page) {
    await expect(talk.phaseLine(page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    expect(await phaseClock(page)).toBeLessThanOrEqual(5);
}

const tribunalOf = (page) => page.locator('[data-ingame-tribunal-presentation]');

// ── 시험 ──

// E-073~078: 인원 5~10, 사람이 마지막 표 → "[5초 뒤 마감]"·남은 초 5 이하, 5초(±1.5) 뒤 재판
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    const no = 73 + i;
    const extra = no === 73 ? ' @safari @smoke' : '';
    test(`A03-E-0${no} 모바일 ${n}명 판 사람이 마지막 표 → "5초 뒤 마감"·남은 초 5 이하, 5초(±1.5) 뒤 재판 @game @realtime${extra}`, async ({ user, table }) => {
        const t = await openVote(table, user, n);
        const { names, X, fullAt } = await humanLastMass(t, user);
        await expectSettleLine(user.page);
        const resolved = await expectFiveSeconds(t.bots[1], fullAt, 1);
        expect(resolved.outcome).toBe('TRIBUNAL');
        await expect(tribunalOf(user.page)).toBeVisible({ timeout: 3_000 });
        await expect(tribunalOf(user.page)).toContainText(names.get(X));
    });
});

// E-080·082·084: 7명 판 투표 30초, 다 찬 때 남은 10·7·3초 (모바일) → 10·7초는 당김·5초 뒤, 3초는 표시 없이 원래 마감
[[80, 10], [82, 7], [84, 3]].forEach(([no, remain]) => {
    const expectation = remain > 5 ? '"5초 뒤 마감"·5초 뒤 판정' : '당김 없이 원래 마감(3초 뒤)에 판정';
    test(`A03-E-0${no} 모바일 7명 판 투표 30초, 남은 ${remain}초에 다 참 → ${expectation} @game @realtime`, async ({ user, table }) => {
        const t = await openVote(table, user, 7, { settings: { dayVoteTime: 30 } });
        const deadline = await voteDeadline(t.bots[1], 1);
        const { fullAt } = await humanLastMass(t, user, { atRemainingMs: remain * 1_000, deadline });
        if (remain > 5) {
            await expectSettleLine(user.page);
            await expectFiveSeconds(t.bots[1], fullAt, 1);
        } else {
            await expect(talk.phaseLine(user.page)).not.toContainText('5초 뒤 마감');
            await expectAtDeadline(t.bots[1], deadline, 1);
        }
        await expect(tribunalOf(user.page)).toBeVisible({ timeout: 3_000 });
    });
});

test('A03-E-098 모바일 6명 판 봇 1이 안 냄 → "5초 뒤 마감" 안 뜸, 투표 30초 끝에 판정, 기권 칸 1 @game @realtime @safari', async ({ user, table }) => {
    const t = await openVote(table, user, 6, { settings: { dayVoteTime: 30 } });
    const deadline = await voteDeadline(t.bots[1], 1);
    const names = await namesOf(t);
    const me = uuidOf(user);
    const [X, Y] = t.bots.map(uuidOf);
    // 봇 4는 안 냄 (계획에 없음)
    const plan = allocate([me, X, Y, ...t.bots.slice(2, 4).map(uuidOf)], X, Y, { x: 4, y: 1 });
    await castMine(user.page, X, names);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    // 마감 2초 전까지도 당김 표시 없음
    await sleep(Math.max(0, deadline - 2_000 - Date.now()));
    await expect(talk.phaseLine(user.page)).not.toContainText('5초 뒤 마감');
    await expectAtDeadline(t.bots[1], deadline, 1);
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
    await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText('1');
});

test('A03-E-100 모바일 6명 판 봇 1 소켓 끊김(60초 안) → 다 찬 것 아님, 원래 마감에 판정 @game @realtime', async ({ user, table }) => {
    const t = await openVote(table, user, 6, { settings: { dayVoteTime: 30 } });
    const deadline = await voteDeadline(t.bots[1], 1);
    const names = await namesOf(t);
    const me = uuidOf(user);
    const [X, Y] = t.bots.map(uuidOf);
    // 봇 4는 끊겨서 못 냄 (끊김 60초 기다림 안이라 산 사람으로 남음)
    t.bots[4].socket.disconnect();
    const plan = allocate([me, X, Y, ...t.bots.slice(2, 4).map(uuidOf)], X, Y, { x: 4, y: 1 });
    await castMine(user.page, X, names);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    await expectAtDeadline(t.bots[1], deadline, 1);
    await expect(talk.phaseLine(user.page)).not.toContainText('5초 뒤 마감');
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
    await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText('1');
});

test('A03-E-102 모바일 7명 판 안 낸 봇이 나감 → 남은 사람 다 냄 → 5초 뒤 판정 @game @realtime', async ({ user, table }) => {
    const t = await openVote(table, user, 7);
    const names = await namesOf(t);
    const me = uuidOf(user);
    const [X, Y] = t.bots.map(uuidOf);
    // 봇 4(의사)가 안 내고 나감 — 광대(봇 5)가 나가면 판이 끝나 버려서 시민 쪽이 나감
    const leaver = t.bots[4];
    const voters = [me, X, Y, ...t.bots.slice(2).map(uuidOf)].filter((u) => u !== uuidOf(leaver));
    const plan = allocate(voters, X, Y, { x: 5, y: 1 });
    await castMine(user.page, X, names);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    const fullAt = Date.now();
    const left = await leaver.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `나가기 거절: ${left?.code}`).toBe(true);
    await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
});

test('A03-E-104 모바일 6명 판 5초 중 새로고침 → 남은 초 5 이하로 이어짐 @game @realtime @safari', async ({ user, table }) => {
    const t = await openVote(table, user, 6);
    const { names, X, fullAt } = await humanLastMass(t, user);
    await expectSettleLine(user.page);
    await user.page.reload();
    // 새로고침 뒤 단계 줄 시계가 5초 이하 (당긴 마감·당김 표시가 판 값에도 실려 "5초 뒤 마감" 글도 다시 뜸 — 5초가 짧아 여기선 남은 초만 봄)
    await expect.poll(() => phaseClock(user.page).catch(() => null), { timeout: 4_000 }).toBeLessThanOrEqual(5);
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    await expect(tribunalOf(user.page)).toBeVisible({ timeout: 10_000 });
    await expect(tribunalOf(user.page)).toContainText(names.get(X));
});

test('A03-E-107 모바일 7명 판 2일(사람 죽음): 산 사람 다 냄 → 죽은 사람 화면에도 "5초 뒤 마감"·결과 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const roles = rolePlan(7);
    const t = await startTalkGame(table, user, { bots: 6, roles });
    await expectRoles(t, roles);
    const me = uuidOf(user);
    // 1일: 봇 표로 나를 처형 (앞 단계라 손잡이로 빨리) → 관전 계속
    await getExecuted(t, me, { pages: [user.page] });
    await t.stopBots();
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_DISCUSSION');
    await clearOverlays(user.page);
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_VOTE');
    await clearOverlays(user.page);

    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    const plan = allocate(t.bots.map(uuidOf), X, Y, { x: 5, y: 1 });
    const panel = await openStatus(user.page);
    const fullAt = await castBotsLast(t, plan);
    await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    await expectFiveSeconds(t.bots[1], fullAt, 2);
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
});

test('A03-E-109 모바일 5명 판 모두 기권으로 다 참 → 5초 뒤 밤, "전원 기권" @game @realtime', async ({ user, table }) => {
    const t = await openVote(table, user, 5);
    const names = await namesOf(t);
    const plan = new Map(t.bots.map((b) => [uuidOf(b), null]));
    await castMine(user.page, null, names);
    const panel = await openStatus(user.page);
    const fullAt = await castBotsLast(t, plan);
    await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    await expectOutcome(user.page, panel, 'ABSTAINED');
});

test('A03-E-112 ③ 모바일 8명 판 마지막 표가 사람 → 5초 뒤 판정 @game @realtime', async ({ user, table }) => {
    const t = await openVote(table, user, 8);
    const { names, X, fullAt } = await humanLastMass(t, user);
    await expectSettleLine(user.page);
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    await expect(tribunalOf(user.page)).toContainText(names.get(X), { timeout: 3_000 });
});
