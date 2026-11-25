'use strict';

// 모바일 낮 표 고르기 시험: 고를 수 있는 사람(나 빼고 산 사람)·죽은 사람·죽은 나·기권·토론 안내·새로고침·안 보이는 표·판정 뒤·동료 광대·현황 창
// 목록 A03-낮투표.md A03-E-129~139 홀수·141·143·145·147·149·151·153·155·159 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-vote-pick.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const {
    talk, startTalkGame, toDay, toVote, toNight, clearOverlays, getExecuted, executeBot,
    rosterRowOf, openRoster, closeRoster, openPlayer, playerItems, pickPlayer, openTrialSheet,
} = require('./_talk');

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

// 세로 카톡형: 카드 판 대신 플레이어 목록 시트 줄마다 행동 단추 (카드 메뉴와 같은 항목·이름) — _talk.js openPlayer·pickPlayer
// 사람 표: null이면 기권 단추 → 기권 단추가 꺼지면 서버가 받은 것
// 사람이면 목록 그 사람 줄 '투표하기' → 그 줄이 '투표취소'면 서버가 받은 것
// (사람을 찍어도 기권 단추가 안 잠김 — 기권으로 바꾸기 됨, PC와 같음, 사용자 결정 2026-11-18)
async function castMine(page, target, names) {
    if (target === null) {
        await abstainButton(page).click();
        await expect(abstainButton(page)).toBeDisabled();
        return;
    }
    await pickPlayer(page, names.get(target), '투표하기', { after: '투표취소' });
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
// 재판이면 모바일(상대 화면)은 현황 창이 저절로 안 닫혀 재판 단추를 덮음 → 재판 시트를 열 때(openTrialSheet) 닫음 → 창 닫힘까지 보고, 결과 글은 statusAfterTribunal로 밤에 다시 열어 봄
// (전엔 닫히는 움직임 동안 글을 읽어 맞았다 틀렸다 함 — A03-E-025·151·211·221)
async function expectOutcome(page, panel, kind, targetNick) {
    // 세로 카톡형 재판: 고발 연출(1초 남짓) 뒤 "최후의 변론" 시트 → 시트 설명 "피고: 닉네임"
    const tribunal = page.locator('[data-ingame-tribunal-presentation], [data-testid="tribunal-presentation-open"], [data-testid="tribunal-presentation-sheet"]');
    if (kind === 'TRIBUNAL') {
        await expect(tribunal.first()).toBeVisible({ timeout: 15_000 });
        const sheet = await openTrialSheet(page);
        await expect(panel).toBeHidden();
        await expect(sheet).toContainText(`피고: ${targetNick}`);
        await sheet.getByRole('button', { name: '최후의 변론 닫기' }).click();
        await expect(sheet).toBeHidden();
        return;
    }
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText(OUTCOME_TEXT[kind], { timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: '단계 전환 안내' })).toContainText('밤이 되었습니다');
    await expect(tribunal).toHaveCount(0);
}

// 재판을 아무도 판정 안 낸 채 끝내고(손잡이) 밤으로 → 현황 창을 다시 열면 그날 결과 "재판 회부" 그대로 → 창
async function statusAfterTribunal(t, page) {
    await toNight(t, page);
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        await clearOverlays(page);
        if (!(await panel.isVisible())) await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2_000 });
        await expect(panel).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText(OUTCOME_TEXT.TRIBUNAL);
    return panel;
}

// 목록 줄의 항목 이름 목록 (누를 수 있는 것만 enabled에), 본 뒤 목록 닫음
async function sheetItems(page, nick) {
    const items = await playerItems(page, nick);
    await closeRoster(page);
    return items;
}

// 누를 수 있는 '투표하기'가 있는 사람 닉네임 목록
async function votableNicks(page, nicks) {
    const out = [];
    for (const nick of nicks) {
        if ((await sheetItems(page, nick)).enabled.includes('투표하기')) out.push(nick);
    }
    return out.sort();
}

// 내 줄("(나)")엔 행동 단추가 없음 (남의 줄엔 있음)
async function expectOwnSlotHasNoSheet(page, otherNick) {
    await openRoster(page);
    const mine = talk.roster(page).locator('li[data-roster-player]').filter({ hasText: ' (나)' });
    await expect(mine).toHaveCount(1);
    await expect(mine.getByRole('menuitem')).toHaveCount(0);
    await expect(rosterRowOf(page, otherNick).getByRole('menuitem').first()).toBeVisible();
    await closeRoster(page);
}

// 1일에 봇 하나를 봇 표로 처형(앞 단계라 손잡이로 빨리) → 2일 투표까지
// 봇 처형이면 처형 연출(영상·글, 10초 남짓)이 끝날 때까지 기다린 뒤 넘김: 밤을 손잡이로 건너뛰면 연출이 2일 낮까지 남아 초상 띠를 덮고,
// 그 뒤에 밀린 "낮이 되었습니다"도 늦게 뜸(A03-E-141) — 나를 처형하면 getExecuted가 연출 뒤 '사망 후 선택'까지 기다림
async function dayTwoVoteAfter(t, page, { killMe = false, victim = null } = {}) {
    if (killMe) await getExecuted(t, uuidOf(t.humans[0]), { pages: [page] });
    else {
        await executeBot(t, victim);
        const expulsion = page.locator('[data-ingame-tribunal-expulsion]');
        await expulsion.first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
        await expect(expulsion).toHaveCount(0, { timeout: 40_000 });
    }
    await t.stopBots();
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_DISCUSSION');
    await clearOverlays(page);
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_VOTE');
    // 낮 안내가 뜬 뒤 닫히고 판 화면이 투표 단계가 될 때까지 (산 사람은 기권 단추, 죽은 나는 채팅방 "죽은 사람끼리" 띠)
    const ready = page.getByRole('button', { name: '기권' }).or(talk.deadBanner(page)).first();
    await expect(async () => {
        await clearOverlays(page);
        await expect(page.getByRole('dialog', { name: '단계 전환 안내' })).toHaveCount(0, { timeout: 1_000 });
        await expect(ready).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
}

// ── 시험 ──

// E-129~139 홀수: 인원 5~10 → 고를 수 있는 사람 = 나 빼고 산 사람
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    const no = 129 + i * 2;
    const smoke = n === 5 ? ' @smoke' : '';
    test(`A03-E-${no} 모바일 ${n}명 판 표 대상 → 고를 수 있는 사람 = 나 빼고 산 사람 ${n - 1}명 @game${smoke}`, async ({ user, table }) => {
        const t = await openVote(table, user, n);
        const others = t.bots.map((b) => b.nickname);
        expect(await votableNicks(user.page, others)).toEqual([...others].sort());
        await expectOwnSlotHasNoSheet(user.page, others[0]);
    });
});

test('A03-E-141 모바일 7명 판 2일(봇 1명 죽음) → 죽은 사람 카드엔 누를 수 있는 투표 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const roles = rolePlan(7);
    const t = await startTalkGame(table, user, { bots: 6, roles });
    await expectRoles(t, roles);
    const victim = t.bots[0];
    await dayTwoVoteAfter(t, user.page, { victim: uuidOf(victim) });
    await openRoster(user.page);
    await expect(rosterRowOf(user.page, victim.nickname)).toContainText('사망');
    await closeRoster(user.page);
    expect((await sheetItems(user.page, victim.nickname)).enabled).not.toContain('투표하기');
    // 산 봇 5명은 그대로 고를 수 있음
    const alive = t.bots.slice(1).map((b) => b.nickname);
    expect(await votableNicks(user.page, alive)).toEqual([...alive].sort());
});

test('A03-E-143 모바일 7명 판 2일 내가 죽음 → 기권 단추 꺼짐·누를 수 있는 투표 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const roles = rolePlan(7);
    const t = await startTalkGame(table, user, { bots: 6, roles });
    await expectRoles(t, roles);
    await dayTwoVoteAfter(t, user.page, { killMe: true });
    // 화면도 투표 단계로 바뀐 뒤 봄: 죽은 사람의 기권 단추는 꺼져 있어, 목록의 산 봇 줄 꺼진 "투표하기" 까닭 글로 봄 (토론이면 토론 안내 글)
    await expect(async () => {
        const row = await openPlayer(user.page, t.bots[0].nickname);
        await expect(row.getByText('사망한 플레이어는 행동할 수 없습니다')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await closeRoster(user.page);
    // 기권 단추: 모바일(상대 화면)은 죽은 사람에게도 그리되 꺼 둠
    await expect(abstainButton(user.page)).toBeDisabled();
    expect(await votableNicks(user.page, t.bots.map((b) => b.nickname))).toEqual([]);
});

test('A03-E-145 모바일 6명 판 "기권" 누름 → 낸 표시(기권 꺼짐) @game', async ({ user, table }) => {
    const t = await openVote(table, user, 6);
    await expect(abstainButton(user.page)).toBeEnabled();
    await castMine(user.page, null, await namesOf(t));
    await expect(abstainButton(user.page)).toBeDisabled();
});

test('A03-E-147 모바일 5명 판 토론 중 → "토론 중입니다. 투표는 아직 열리지 않았습니다.", 표 못 냄 @game', async ({ user, table }) => {
    const roles = rolePlan(5);
    const t = await startTalkGame(table, user, { bots: 4, roles });
    await expectRoles(t, roles);
    await toDay(t, user.page);
    // 토론 중엔 기권 단추 없음, 목록 줄의 '투표하기'는 꺼진 채 까닭 글
    await expect(abstainButton(user.page)).toHaveCount(0);
    const row = await openPlayer(user.page, t.bots[0].nickname);
    await expect(row.getByRole('menuitem', { name: '투표하기' })).toBeDisabled();
    await expect(row.getByText('토론 중입니다. 투표는 아직 열리지 않았습니다.')).toBeVisible();
});

test('A03-E-149 [지금 동작] 모바일 8명 판 표 낸 뒤 새로고침 → 낸 표시 남음, 다시 바꿀 수 있음 @game', async ({ user, table }) => {
    const t = await openVote(table, user, 8);
    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    await castMine(user.page, X, names);
    await user.page.reload();
    await expect(talk.phaseLine(user.page)).toBeVisible({ timeout: 20_000 });
    await clearOverlays(user.page);
    // 낸 표시: X 줄은 '투표취소', 기권 단추는 켜짐 (찍은 뒤 기권으로 바꾸기 됨, PC와 같음, 사용자 결정 2026-11-18)
    await expect(abstainButton(user.page)).toBeEnabled();
    expect((await sheetItems(user.page, names.get(X))).all).toEqual(['투표취소']);
    // 다시 바꿈: Y '투표하기' → Y 줄이 '투표취소'
    await pickPlayer(user.page, names.get(Y), '투표하기', { close: false });
    await expect.poll(async () => (await sheetItems(user.page, names.get(Y))).all).toEqual(['투표취소']);
});

test('A03-E-151 모바일 7명 판 봇끼리 서로 찍어도 사람 화면엔 수·결과만, 투표자 이름 없음 @game', async ({ user, table }) => {
    const t = await openVote(table, user, 7);
    const names = await namesOf(t);
    const ids = t.bots.map(uuidOf);
    const [X, Y] = ids;
    // 봇끼리 서로: X←봇1·봇2·봇3, Y←X·봇4, 봇5 기권, 사람 기권 → X 3·Y 2·기권 2 → X 재판
    const plan = new Map([[ids[0], Y], [ids[1], X], [ids[2], X], [ids[3], X], [ids[4], Y], [ids[5], null]]);
    await castMine(user.page, null, names);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
    // 현황 창엔 재판 대상 말고 다른 사람 이름이 안 나옴 (재판 동안 창이 닫혀 있어 밤에 다시 연 창으로 봄)
    const text = await (await statusAfterTribunal(t, user.page)).innerText();
    for (const uuid of ids.filter((u) => u !== X)) expect(text).not.toContain(names.get(uuid));
    expect(text).not.toContain(names.get(uuidOf(user)));
});

test('A03-E-153 모바일 6명 판 재판으로 넘어간 뒤 → 낮 표 단추 없음, 결과 그대로 @game', async ({ user, table }) => {
    const t = await openVote(table, user, 6);
    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    const plan = allocate([uuidOf(user), X, Y, ...t.bots.slice(2).map(uuidOf)], X, Y, { x: 5, y: 1 });
    await castMine(user.page, X, names);
    const panel = await openStatus(user.page);
    await castBots(t, plan);
    await expectOutcome(user.page, panel, 'TRIBUNAL', names.get(X));
    // 재판 중엔 기권 단추도 '투표하기'도 없음
    await expect(abstainButton(user.page)).toHaveCount(0);
    await expect(user.page.getByRole('menuitem', { name: '투표하기' })).toHaveCount(0);
    // 피고 그대로
    const s = await t.state();
    expect(s.phase).toBe('TRIBUNAL');
    expect(s.tribunal?.defendantUuid).toBe(X);
    // 결과 그대로: 재판 동안 현황 창이 닫혀 있음 → 밤에 다시 열어 "재판 회부"·재판 대상
    const after = await statusAfterTribunal(t, user.page);
    await expect(after.getByTestId('vote-status-tribunal-target')).toHaveText(names.get(X));
});

test('A03-E-155 모바일 7명 판(직접 지정 광대 2) 사람 광대가 동료 광대에게 투표 → 받아들여짐 @game', async ({ user, table }) => {
    // 광대 2·나머지 시민: 나와 봇 0이 광대
    const roles = ({ humans, bots }) => ({
        [uuidOf(humans[0])]: 'JOKER', [uuidOf(bots[0])]: 'JOKER',
        ...Object.fromEntries(bots.slice(1).map((b) => [uuidOf(b), 'CITIZEN'])),
    });
    const t = await startTalkGame(table, user, { bots: 6, roles, settings: customRoleSettings({ JOKER: 2 }) });
    await expectRoles(t, roles);
    await toDay(t, user.page);
    await toVote(t, user.page);
    const ally = t.bots[0].nickname;
    await castMine(user.page, uuidOf(t.bots[0]), await namesOf(t));
    expect((await sheetItems(user.page, ally)).all).toEqual(['투표취소']);
});

test('A03-E-159 모바일 5명 판 투표 현황 창 열기 → 보임, 닫기 → 안 보임 @game', async ({ user, table }) => {
    await openVote(table, user, 5);
    const panel = await openStatus(user.page);
    // 제목은 누르기를 안 받는 글(pointer-events:none)이고 위에 투명한 내용 칸(바탕색 없음)이 겹쳐 있어 "가려짐"으로 잡힘 → 가려짐만 빼고 봄 (실패 그림에서 제목이 또렷이 보임)
    await expectReadable(panel.getByRole('heading', { name: '투표 현황' }), { uncovered: false });
    await panel.getByRole('button', { name: '투표 현황 닫기' }).click();
    await expect(panel).toBeHidden();
});
