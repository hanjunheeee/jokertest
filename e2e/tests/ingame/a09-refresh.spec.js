'use strict';

// 판 중 새로고침 브라우저 시험 (PC) — 새로고침해도 같은 단계·줄어든 남은 시간·내 직업과 동료·낸 표·내 밤 차례·피고 화면·사망 창·채팅이 그대로, 결과 화면 새로고침은 결과를 못 봄
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-038~041·044·046~051·101 (PC 줄) — 그 단계까지는 손잡이로 감
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const night = require('./b-night/_night');
const L = require('./a-day/_lib');
const c = require('./c-chat/_lib');
const K = require('./_a09-simple-kit');

const cards = (page) => page.locator('[data-ingame-player-nickname]');
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const dayNotice = (page) => page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: '낮이 되었습니다' });
// 펼친 시간 바의 단계 글 ("[낮-토론과 투표]" 같은 모양)
const phaseLabel = (page) => K.timebar(page).getByText(/^\[.+-.+\]$/).first();

// 새로고침 → 판 화면 그대로, 카드가 다 그려질 때까지
async function reloadIngame(page, n) {
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/);
    await expect(cards(page)).toHaveCount(n, { timeout: 30_000 });
}

// 남은 초가 지난 시간만큼 줄었는지 (늘거나 처음 값으로 돌아가면 실패, 초 단위 표시라 ±2초)
function expectCountedDown(before, after, elapsedMs) {
    expect(after, '새로고침 뒤 남은 초가 늘지 않음').toBeLessThanOrEqual(before);
    expect(before - after, '줄어든 초가 지난 시간보다 훨씬 작지 않음').toBeGreaterThanOrEqual(Math.floor(elapsedMs / 1000) - 2);
    expect(before - after, '줄어든 초가 지난 시간보다 훨씬 크지 않음').toBeLessThanOrEqual(Math.ceil(elapsedMs / 1000) + 2);
}

// 단계마다: 판 인원 · 그 단계까지 가는 법 · 새로고침 뒤 그 단계인지 보는 것 · 판 화면이 재판 창에 덮여 잠기는지
const PHASES = [
    {
        no: 'A09-E-038', n: 5, label: '토론', phase: 'DAY',
        go: async (t) => { await K.toDay(t); },
        shown: async (page) => { await expectReadable(page.getByRole('button', { name: '투표 시작 준비' })); },
    },
    {
        no: 'A09-E-039', n: 6, label: '투표', phase: 'DAY',
        go: async (t) => { await K.toVote(t); },
        shown: async (page) => { await expectReadable(page.getByRole('button', { name: '기권' })); },
    },
    {
        // 재판: 봇 표로 시민 봇 하나를 피고로 세움 (나는 투표자)
        no: 'A09-E-040', n: 7, label: '재판', phase: 'TRIBUNAL', locked: true,
        go: async (t) => { await K.voteOut(t, K.U(K.botOf(t, await t.state(), 'CITIZEN'))); },
        shown: async (page) => { await expect(K.tribunalWindow(page)).toBeVisible({ timeout: 15_000 }); },
    },
    {
        no: 'A09-E-041', n: 8, label: '밤', phase: 'NIGHT',
        go: async (t) => { await K.toNight(t, 1); },
        shown: async (page) => { await expect(phaseLabel(page)).toHaveText(/^\[밤-.+\]$/, { timeout: 15_000 }); },
    },
];

for (const p of PHASES) {
    const smoke = p.no === 'A09-E-038' ? ' @smoke' : '';
    test(`${p.no} PC ${p.n}명 판 ${p.label} 중 새로고침 → 같은 단계 글, 남은 시간은 줄어든 값 @game${smoke}`, async ({ user, table }) => {
        const page = user.page;
        await K.pinTimebar(page);
        const t = await K.seat(table, user, { n: p.n });
        await p.go(t);
        await K.expandBar(page, { locked: p.locked });
        // 화면이 그 단계까지 따라온 뒤에 남은 시간을 읽음
        await p.shown(page);
        const labelBefore = await phaseLabel(page).innerText();
        const before = await K.barSeconds(page);
        const readAt = Date.now();
        expect(before, '새로고침 전 남은 초').toBeGreaterThan(0);

        await reloadIngame(page, p.n);
        await K.expandBar(page, { locked: p.locked });
        await expect(phaseLabel(page)).toHaveText(labelBefore);
        const after = await K.barSeconds(page);
        expectCountedDown(before, after, Date.now() - readAt);
        await p.shown(page);
        expect((await t.state()).phase, '서버 단계').toBe(p.phase);
    });
}

test('A09-E-044 PC 8명 판(직접 구성 의사 2), 새로고침 뒤 내 직업 "의사"와 "동료 의사" + 상대 닉네임 그대로 @game', async ({ user, table }) => {
    const page = user.page;
    const me = K.U(user);
    const t = await K.seat(table, user, { n: 8, role: 'DOCTOR', settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }) });
    const partner = K.botOf(t, await t.state(), 'DOCTOR');
    await K.toDay(t);
    await reloadIngame(page, 8);
    // 떠 있는 안내 창을 닫으며 "내 역할 보기" 단추로 역할 창 다시 엶
    const dialog = revealDialog(page);
    await expect(async () => {
        await ui.closeOverlays(page, { names: ['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과'] });
        if (!(await dialog.isVisible())) await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 25_000 });
    await expectReadable(dialog.getByText('의사', { exact: true }));
    await expectReadable(dialog.getByText('동료 의사', { exact: true }));
    await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
    await expectReadable(dialog.getByText(partner.nickname, { exact: true }));
    expect(K.roleOf(await t.state(), me)).toBe('DOCTOR');
});

test('A09-E-046 PC 6명 판, 표 낸 뒤 새로고침 → 내 표 표시 그대로 (찍은 카드에 "투표취소", 기권 단추 꺼짐) @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    const target = K.botOf(t, await t.state(), 'CITIZEN');
    await K.toVote(t);
    await K.clear(page);
    await L.voteUi(page, target.nickname);
    await reloadIngame(page, 6);
    await expect(page.getByRole('button', { name: '기권' })).toBeDisabled();
    const menu = await night.openCardMenu(page, target.nickname);
    await expect(menu.getByRole('menuitem', { name: '투표취소' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '투표하기' })).toHaveCount(0);
});

test('A09-E-047 PC 7명 판 의사, 내 밤 차례 중 새로고침 → 대상 고르기가 되고 서버가 받음 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 7, role: 'DOCTOR', settings: customRoleSettings({ JOKER: 1, DOCTOR: 1 }) });
    const target = K.botOf(t, await t.state(), 'CITIZEN');
    await night.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    await reloadIngame(page, 7);
    const s = await t.state();
    expect(`${s.phase}/${s.nightTurnRole}`, '새로고침 뒤에도 내 차례').toBe('NIGHT/DOCTOR');
    await night.nightActUi(page, target.nickname, '보호');
    // 서버가 받으면 같은 카드 메뉴가 "취소하기"로 바뀜
    await expect(async () => {
        const menu = await night.openCardMenu(page, target.nickname, { timeout: 5000 });
        await expect(menu.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
});

test('A09-E-048 PC 5명 판, 역할 확인 중 새로고침 → 판 그대로, 10초 뒤 첫 낮 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 5, closeReveal: false });
    await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
    expect((await t.state()).phase, '새로고침하는 순간 단계').toBe('ROLE_REVEAL');
    await reloadIngame(page, 5);
    expect((await t.player(K.U(user))).isParticipating).toBe(true);
    // 손잡이 없이 역할 확인 10초가 끝나길 기다림
    await expect(dayNotice(page)).toBeVisible({ timeout: 15_000 });
    await expectReadable(dayNotice(page).getByText('낮이 되었습니다'));
    const s = await t.state();
    expect(`${s.phase}/${s.dayIndex}`).toBe('DAY/1');
});

test('A09-E-049 PC 6명 판, 피고인 내가 재판 중 새로고침 → 재판 창 피고 화면 @game', async ({ user, table }) => {
    const page = user.page;
    const me = K.U(user);
    const t = await K.seat(table, user, { n: 6 });
    const { state } = await K.voteOut(t, me);
    expect(state.phase).toBe('TRIBUNAL');
    expect(state.tribunal.defendantUuid).toBe(me);
    await expect(K.tribunalWindow(page)).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/);
    await expect(K.tribunalWindow(page)).toBeVisible({ timeout: 30_000 });
    await expectReadable(K.tribunalWindow(page).getByText('당신은 피고인입니다. 투표할 수 없습니다.', { exact: true }));
    await expect(K.tribunalWindow(page).getByRole('button', { name: '유죄' })).toHaveCount(0);
    expect((await t.state()).phase, '서버 단계').toBe('TRIBUNAL');
});

test('A09-E-050 PC 8명 판, 처형 직후 새로고침 → 사망 창 다시 뜸 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 8 });
    await c.executeByBots(t, K.U(user));
    await t.stopBots();
    await K.waitDeadChoice(page);
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/);
    const dialog = await K.waitDeadChoice(page);
    await expectReadable(dialog.getByText('당신은 사망했습니다.', { exact: true }));
    await expectReadable(dialog.getByRole('button', { name: '관전 계속하기' }));
});

test('A09-E-051 PC 7명 판, 새로고침 뒤 앞 채팅 줄 그대로 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await K.seat(table, user, { n: 7 });
    await K.toDay(t);
    const mine = c.uniq('새로고침전내말');
    const theirs = c.uniq('새로고침전봇말');
    await c.say(page, mine);
    expect((await c.botSay(t, 1, theirs))?.ok, '봇 채팅을 서버가 받음').toBe(true);
    await c.expectLine(page, user.account.nickname, mine);
    await c.expectLine(page, t.bots[1].nickname, theirs);

    await reloadIngame(page, 7);
    await c.readyToChat(page);
    await c.expectLine(page, user.account.nickname, mine);
    await c.expectLine(page, t.bots[1].nickname, theirs);
    // 채팅 줄은 통째로는 대비를 못 셈 → 보임·화면 안·안 가려짐만
    await expectReadable(c.chatLog(page).getByRole('listitem').filter({ hasText: mine }).first(), { contrast: false });
});

test('A09-E-101 PC 6명 판, 결과 화면 새로고침 → "게임 결과를 확인할 수 없습니다" + "로비로 돌아가기" @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const t = await K.seat(table, user, { n: 6 });
    await K.toCitizenWin(t, page);
    await page.reload();
    await expectReadable(page.getByText('게임 결과를 확인할 수 없습니다', { exact: true }));
    const back = page.getByRole('button', { name: '로비로 돌아가기' });
    await expectReadable(back);
    await back.click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
});
