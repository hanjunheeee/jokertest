'use strict';

// 판 골드 브라우저 시험 (PC) — 끝까지 있던 사람(이긴 편·진 편·산 사람·죽은 사람·죽은 뒤 나간 사람)은 결과판 내 줄 "+N골드"와 지갑·장부, 산 채로 나간 사람만 못 받음, 관리자 값 0·2·100
// 목록 시험목록/A07-승패-결과-골드.md A07-E-026~038·114~117·119·128·139, 모이는지만 봄: npx playwright test --list tests/ingame/a07-gold.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const store = require('../store/store-tools');
const n = require('./b-night/_night');
const k = require('./_a07-simple-kit');

const { C, uid, nick } = k;

// 결과판 내 줄의 골드 칸
const myGold = (page, user) => k.rowOf(page, nick(user)).getByTestId('game-result-gold-reward');

// 시민 승으로 끝내고 결과판까지: 봇 표로 광대(t.bots[0]) 처형
async function citizenWin(t, page) {
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.reachBoard(page);
}

// 지갑 골드가 그 값이 될 때까지 (지급은 판 끝 저장 뒤에 따로 돎)
async function expectGold(user, amount) {
    await expect.poll(() => k.gold(uid(user)), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// 결과 화면 "로비로" → 확인 창 수락 → 로비
async function toLobby(page) {
    k.acceptConfirms(page);
    await page.getByRole('button', { name: '로비로' }).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
}

// 관리자 값을 바꾼 채 시험하고 끝에 1로 되돌림 (값은 서버 전체가 같이 써서 이 시험들은 @serial)
async function withAdmin(browser, run) {
    const admin = await k.openAdmin(browser);
    try {
        await run(admin);
    } finally {
        try { await admin.setGold(1); } finally { await admin.close(); }
    }
}

test('A07-E-026 5명 판 이긴 편 산 사람: 결과판 내 줄 "+1골드" @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    await citizenWin(t, page);
    await expect(k.banner(page)).toHaveText('승리');
    await expect(myGold(page, user)).toHaveText('+1골드');
});

test('A07-E-027 6명 판 진 편 산 사람도 내 줄 "+1골드" @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(3)]);
    // 시민 봇 둘이 나가 2:2 → 광대 승 (나는 산 채로 짐)
    await k.leave(t, t.bots[2]);
    await k.leave(t, t.bots[3]);
    await k.reachBoard(page);
    await expect(k.banner(page)).toHaveText('패배');
    await expect(myGold(page, user)).toHaveText('+1골드');
});

test('A07-E-028 7명 판 이긴 편 죽은 사람: 내가 처형된 뒤 관전 → 판 끝 내 줄 "+1골드" @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    const night1 = await k.execute(t, uid(user));
    expect(n.rowOf(night1, uid(user)).alive, '나는 처형됨').toBe(false);
    await k.deadChoice(page, '관전 계속하기');
    // 밤을 넘겨 둘째 날 광대 처형 → 시민 승
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
    await citizenWin(t, page);
    await expect(k.banner(page)).toHaveText('승리');
    await expect(myGold(page, user)).toHaveText('+1골드');
});

test('A07-E-029 8명 판 진 편 죽은 사람: 내가 암살된 뒤 관전 → 내 편이 져도 "+1골드" @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(5)]);
    const [j1, j2, , , c3, c4, c5] = t.bots;
    const day2 = await k.nightKill(t, [j1, j2], uid(user));
    expect({ phase: day2.phase, me: n.rowOf(day2, uid(user)).alive }).toEqual({ phase: 'DAY', me: false });
    await k.deadChoice(page, '관전 계속하기');
    // 시민 봇 셋이 나가 2:2 → 광대 승
    for (const bot of [c3, c4, c5]) await k.leave(t, bot);
    await k.reachBoard(page);
    await expect(k.banner(page)).toHaveText('패배');
    await expect(myGold(page, user)).toHaveText('+1골드');
});

test('A07-E-030 5명 판 관리자 API로 값 2 → 새 판 끝 "+2골드", 지갑 +2 @game @serial', async ({ user, table, browser }) => {
    await withAdmin(browser, async (admin) => {
        await admin.setGold(2);
        const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
        const before = await k.gold(uid(user));
        await citizenWin(t, page);
        await expect(myGold(page, user)).toHaveText('+2골드');
        await expectGold(user, before + 2);
    });
});

test('A07-E-031 6명 판 관리자 API로 값 0 → 판 끝 골드 칸 없음, 지갑 그대로·장부 0줄 @game @serial', async ({ user, table, browser }) => {
    await withAdmin(browser, async (admin) => {
        await admin.setGold(0);
        const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
        const before = await k.gold(uid(user));
        await citizenWin(t, page);
        await expect(k.rows(page)).toHaveCount(6);
        await expect(k.goldCells(page)).toHaveCount(0);
        // 판 끝 처리가 다 끝난 뒤에도 안 들어옴
        await k.settled(t, t.bots[1]);
        expect(await k.gold(uid(user))).toBe(before);
        expect(await k.rewardRows(t.gameId)).toHaveLength(0);
    });
});

test('A07-E-032 5명 판 관리자 API로 값 100 → "+100골드", 지갑 +100 @game @serial', async ({ user, table, browser }) => {
    await withAdmin(browser, async (admin) => {
        await admin.setGold(100);
        const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
        const before = await k.gold(uid(user));
        await citizenWin(t, page);
        await expect(myGold(page, user)).toHaveText('+100골드');
        await expectGold(user, before + 100);
    });
});

test('A07-E-033 7명 판 결과판 골드 칸은 내 줄 1개뿐 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    await citizenWin(t, page);
    await expect(k.rows(page)).toHaveCount(7);
    await expect(k.goldCells(page)).toHaveCount(1);
    await expect(myGold(page, user)).toHaveCount(1);
});

test('A07-E-034 8명 판 골드 글이 사람 눈에 읽힘 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    await citizenWin(t, page);
    await expect(myGold(page, user)).toHaveText('+1골드');
    await expectReadable(myGold(page, user));
});

test('A07-E-035 5명 판 판 전 상점 잔액 N → 판 끝 뒤 상점 잔액 N+1 @game', async ({ user, table }) => {
    const before = await k.gold(uid(user));
    await store.gotoStore(user.page);
    await expect(store.balance(user.page, '골드', before)).toBeVisible();
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)], { keepUser: true });
    await citizenWin(t, page);
    await expectGold(user, before + 1);
    await store.gotoStore(page);
    await expect(store.balance(page, '골드', before + 1)).toBeVisible();
});

test('A07-E-036 6명 판 장부에 그 판 GAME_REWARD 줄이 사람마다 1개 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
    await citizenWin(t, page);
    await k.settled(t, t.bots[1]);
    const ledger = await k.rewardRows(t.gameId);
    expect(ledger.map((r) => r.user_id).sort()).toEqual([uid(user), ...t.bots.map(uid)].sort());
    for (const row of ledger) expect({ currency: row.currency, amount: Number(row.amount) }).toEqual({ currency: 'GOLD', amount: 1 });
});

test('A07-E-037 7명 판 내가 처형된 뒤 나가도 판이 끝나면 지갑 +1 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    const before = await k.gold(uid(user));
    await k.execute(t, uid(user));
    await k.deadChoice(page, '게임 나가기');
    // 나는 방 고르는 화면, 판은 남은 봇끼리 둘째 날 광대 처형으로 끝남
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2);
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await expectGold(user, before + 1);
    expect((await k.rewardRows(t.gameId)).filter((r) => r.user_id === uid(user))).toHaveLength(1);
});

test('A07-E-038 8명 판 내가 산 채로 나가면 판이 끝나도 지갑 그대로·장부 0줄 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    const before = await k.gold(uid(user));
    await k.leaveAliveUi(page);
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    // 남은 7명은 받고 나만 빠짐
    await k.settled(t, t.bots[1]);
    const ledger = await k.rewardRows(t.gameId);
    expect(ledger).toHaveLength(7);
    expect(ledger.filter((r) => r.user_id === uid(user))).toHaveLength(0);
    expect(await k.gold(uid(user))).toBe(before);
});

test('A07-E-114 6명 판 판 중에 관리자 API로 값 3 → 그 판은 시작 값대로 "+1골드", 장부 금액 1 @game @serial', async ({ user, table, browser }) => {
    await withAdmin(browser, async (admin) => {
        const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
        await admin.setGold(3);
        expect(await k.goldSetting(), '표 값은 3으로 바뀜').toBe(3);
        await citizenWin(t, page);
        await expect(myGold(page, user)).toHaveText('+1골드');
        await k.settled(t, t.bots[1]);
        const ledger = await k.rewardRows(t.gameId);
        expect(ledger).toHaveLength(6);
        for (const row of ledger) expect(Number(row.amount)).toBe(1);
    });
});

test('A07-E-115 5명 판 결과 화면 "로비로"를 눌러도 지갑 +1 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    const before = await k.gold(uid(user));
    await citizenWin(t, page);
    await toLobby(page);
    await expectGold(user, before + 1);
});

test('A07-E-116 6명 판 결과 화면 "대기방으로"를 눌러도 지갑 +1 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
    const before = await k.gold(uid(user));
    await citizenWin(t, page);
    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expectGold(user, before + 1);
});

test('A07-E-117 7명 판 봇이 끊겨 기다리는 중에 판이 끝남 → 그 봇도 장부 1줄 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    const [joker, c1, c2, c3, c4, gone] = t.bots;
    gone.socket.disconnect();
    await n.expectCard(page, nick(gone), 'disconnected');
    // 끊긴 봇은 표를 못 냄 → 남은 시민 봇 넷이 광대를 찍음 (4표 > 기권 3)
    const end = await k.execute(t, uid(joker), [c1, c2, c3, c4]);
    expect(end.winResult?.winner).toBe('CITIZEN');
    expect(n.rowOf(end, uid(gone)).alive, '60초 전이라 탈락 아님').toBe(true);
    await k.settled(t, c1);
    const mine = (await k.rewardRows(t.gameId)).filter((r) => r.user_id === uid(gone));
    expect(mine.map((r) => Number(r.amount))).toEqual([1]);
});

test('A07-E-119 5명 판 판 끝 뒤 상점 재화 내역에 "판 보상" +1 줄 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    const before = await k.gold(uid(user));
    await citizenWin(t, page);
    await expectGold(user, before + 1);
    await store.gotoStore(page);
    await store.pickCategory(page, '인게임 재화');
    const line = page.getByTestId('currency-history').getByTestId('currency-transaction').filter({ hasText: '판 보상' });
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('transaction-amount')).toHaveText('+1');
    await expectReadable(line.getByText('판 보상', { exact: true }));
});

test('A07-E-128 7명 판 골드 칸은 "내 정보" 줄 안에 있음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)]);
    await citizenWin(t, page);
    const mine = k.rows(page).filter({ hasText: '내 정보' });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(nick(user));
    await expect(mine.getByTestId('game-result-gold-reward')).toHaveText('+1골드');
});

test('A07-E-139 5명 판 판 끝 → "로비로" → 로비 메뉴로 들어간 상점의 골드 숫자 +1 @game', async ({ user, table }) => {
    // 목록은 "로비 위 골드"인데 PC 로비 화면엔 골드 숫자가 없음 → 로비에서 메뉴로 들어간 상점 잔액으로 봄 (새로고침 없이)
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    const before = await k.gold(uid(user));
    await citizenWin(t, page);
    await expectGold(user, before + 1);
    await toLobby(page);
    await ui.skipIntro(page);
    await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '상점' }).click();
    await expect(page).toHaveURL(/\/store/);
    await ui.skipIntro(page);
    await expect(store.balance(page, '골드', before + 1)).toBeVisible();
});
