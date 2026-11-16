'use strict';

// 모바일 "낮 집계" 단추 없음 시험: 단계(토론·투표·5초 중) × (산·죽은 나), 6·7·8명 판 고루
// 목록 A03-낮투표.md A03-E-117·119·121·123·125·127 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-no-resolve-button.spec.js
const { test, expect } = require('../../helpers/fixtures');
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

// 화면 어디에도 "낮 집계" 글·집계 단추 없음 (결-5초: 단추 없앰)
async function expectNoResolveButton(page) {
    await expect(page.getByText('낮 집계')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /집계/ })).toHaveCount(0);
}

// 1일에 봇 표로 나를 처형(앞 단계라 손잡이로 빨리) → 2일 토론까지
async function deadOnDayTwo(table, user, n) {
    const roles = rolePlan(n);
    const t = await startTalkGame(table, user, { bots: n - 1, roles });
    await expectRoles(t, roles);
    await getExecuted(t, uuidOf(user), { pages: [user.page] });
    await t.stopBots();
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_DISCUSSION');
    await clearOverlays(user.page);
    return t;
}

// 2일 투표까지 (죽은 나)
async function toDayTwoVote(t, page) {
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_VOTE');
    await clearOverlays(page);
    await expect(abstainButton(page)).toBeDisabled();
}

// 살아 있는 사람 전부 몰표로 다 내서 "5초 뒤 마감"이 보일 때까지 (사람 빼고 봇만이면 me 없이)
async function fillToSettle(t, page, { withMe }) {
    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    const alive = (await t.state()).players.filter((p) => p.alive).map((p) => p.uuid);
    const order = [X, Y, ...alive.filter((u) => u !== X && u !== Y)];
    const plan = allocate(order, X, Y, { x: alive.length - 1, y: 1 });
    if (withMe) await castMine(page, plan.get(uuidOf(t.humans[0])), names);
    await castBots(t, plan);
    await expect(talk.phaseLine(page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
}

// ── 시험 ──

test('A03-E-117 모바일 6명 판 토론 · 산 나 → "낮 집계" 단추 없음 @game @smoke', async ({ user, table }) => {
    const roles = rolePlan(6);
    const t = await startTalkGame(table, user, { bots: 5, roles });
    await expectRoles(t, roles);
    await toDay(t, user.page);
    await expect(talk.phaseAction(user.page, 'dayReady')).toBeVisible();
    await expectNoResolveButton(user.page);
});

test('A03-E-119 모바일 7명 판 토론 · 죽은 나(2일) → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    await deadOnDayTwo(table, user, 7);
    await expect(talk.phaseLine(user.page)).toContainText('제 2일');
    await expectNoResolveButton(user.page);
});

test('A03-E-121 모바일 8명 판 투표 · 산 나 → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    await openVote(table, user, 8);
    await expect(abstainButton(user.page)).toBeEnabled();
    await expectNoResolveButton(user.page);
});

test('A03-E-123 모바일 6명 판 투표 · 죽은 나(2일) → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await deadOnDayTwo(table, user, 6);
    await toDayTwoVote(t, user.page);
    await expectNoResolveButton(user.page);
});

test('A03-E-125 모바일 7명 판 5초 중 · 산 나 → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    const t = await openVote(table, user, 7);
    await fillToSettle(t, user.page, { withMe: true });
    await expectNoResolveButton(user.page);
});

test('A03-E-127 모바일 8명 판 5초 중 · 죽은 나(2일) → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const t = await deadOnDayTwo(table, user, 8);
    await toDayTwoVote(t, user.page);
    await fillToSettle(t, user.page, { withMe: false });
    await expectNoResolveButton(user.page);
});
