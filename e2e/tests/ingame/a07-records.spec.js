'use strict';

// 전적·업적 브라우저 시험 (PC) — 판 끝 뒤 마이페이지 판 수·승률, 직업 전적, 기준 바로 밑에서 한 판 끝내면 업적 알림과 보상 골드, 탈주자는 승리로 안 셈
// 목록 시험목록/A07-승패-결과-골드.md A07-E-051~054·121~126·135~137, 모이는지만 봄: npx playwright test --list tests/ingame/a07-records.spec.js
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a07-simple-kit');

const { C, uid } = k;
const id = (no) => `A07-E-${String(no).padStart(3, '0')}`;

// 업적 id (서버 정의): 판 수 3·생존 5·승 10, 직업 10승은 <직업 앞글자>-win-10
const GAMES_3 = 'record-1-masquerade';
const SURVIVE_5 = 'record-3-first-morning';
const WINS_10 = 'record-5-clown-story';

test.afterEach(k.cleanSeeds);

// 마이페이지 "피의 기록" 줄 값 (이름 바로 옆 칸)
const statValue = (page, label) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');

// 마이페이지 열어 전체 판수·승률 읽기 → 예: { games: 3, rate: '66.7%' }
async function readMyPage(page) {
    await page.goto('/mypage');
    await ui.skipIntro(page, { timeoutMs: 1500 });
    await expect(statValue(page, '전체 판수')).toBeVisible();
    return { games: Number(await statValue(page, '전체 판수').innerText()), rate: await statValue(page, '승률').innerText() };
}

// 내 직업 전적 (서재 "나의 직업 전적"이 읽는 값) → 예: { DOCTOR: { games: 1, wins: 1 } }
async function roleStats(page) {
    const res = await page.context().request.get(`${E2E.apiUrl}/user/me/role-statistics`, { headers: { origin: E2E.desktopUrl } });
    expect(res.ok(), `직업 전적 읽기 (${res.status()})`).toBe(true);
    const { data } = await res.json();
    return Object.fromEntries(data.map((entry) => [entry.role, { games: entry.games, wins: entry.wins }]));
}
const totalOf = (stats, key) => Object.values(stats).reduce((sum, entry) => sum + entry[key], 0);

// 시민 승으로 끝내고 결과판 → 판 끝 처리(전적·판 골드·업적)까지 끝남: 봇 표로 광대(t.bots[0]) 처형
async function citizenWin(t, page) {
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.reachBoard(page);
    await k.settled(t, t.bots[1]);
}

// 광대 승으로 끝내고 결과판 → 판 끝 처리까지: 시민 봇들이 나가 광대 = 나머지
async function jokerWin(t, page, leavers, watcher) {
    for (const bot of leavers) await k.leave(t, bot);
    expect((await t.state()).winResult?.winner).toBe('JOKER');
    await k.reachBoard(page);
    await k.settled(t, watcher);
}

test(`${id(51)} 6명 판 판 전 마이페이지 N판 → 판 끝 뒤 N+1판 @game @smoke`, async ({ user, table }) => {
    const before = await readMyPage(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)], { keepUser: true });
    await citizenWin(t, page);
    const after = await readMyPage(page);
    expect(after.games).toBe(before.games + 1);
    await expectReadable(statValue(page, '전체 판수'));
});

test(`${id(52)} 5명 판 판 수 2인 사람이 판을 끝냄 → 판 수 업적 알림, 골드 +50(업적) +1(판) @game`, async ({ user, table }) => {
    const events = k.watchSocket(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)], { keepUser: true });
    await k.seedGames(uid(user), 2);
    const before = await k.gold(uid(user));
    await citizenWin(t, page);
    expect(await k.grantedIds(uid(user))).toEqual([GAMES_3]);
    expect(k.grantedEvents(events)).toEqual([GAMES_3]);
    expect(await k.gold(uid(user))).toBe(before + 51);
});

test(`${id(53)} 7명 판 생존 4인 사람이 끝까지 살아 판 끝 → 생존 업적 받음 @game`, async ({ user, table }) => {
    const events = k.watchSocket(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(5)], { keepUser: true });
    // 옛 판 4개를 넣으면 판 수 업적 기준도 넘음 → 그건 이미 받은 것으로 적어 생존 업적만 새로 받게
    await k.seedGames(uid(user), 4, { alive: true });
    await k.markGranted(uid(user), [GAMES_3]);
    await citizenWin(t, page);
    expect((await k.grantedIds(uid(user))).sort()).toEqual([GAMES_3, SURVIVE_5].sort());
    expect(k.grantedEvents(events)).toEqual([SURVIVE_5]);
});

test(`${id(54)} 8명 판 의사로 판 끝 → 내 직업 전적의 의사 판 수 +1 @game`, async ({ user, table }) => {
    // 목록은 "마이페이지 의사 판"인데 마이페이지엔 직업별 판 수가 없음 → 서재 "나의 직업 전적"이 읽는 값으로 봄
    const { t, page } = await k.open(table, user, 'DOCTOR', ['JOKER', ...C(6)]);
    const before = (await roleStats(page)).DOCTOR?.games ?? 0;
    await citizenWin(t, page);
    const after = await roleStats(page);
    expect(after.DOCTOR?.games).toBe(before + 1);
    // 다른 직업 판 수는 그대로 (의사 한 줄만 생김)
    expect(totalOf(after, 'games')).toBe(before + 1);
});

// A07-E-121~125: 직업 10승 업적 — 그 직업 9승(DB) + 이번 판을 그 직업으로 이김, 인원 5·6·7·8·10
const JOB_WINS = [
    { no: 121, role: 'CITIZEN', prefix: 'noble', label: '귀족(시민)', bots: ['JOKER', ...C(3)] },
    { no: 122, role: 'JOKER', prefix: 'clown', label: '광대', bots: C(5) },
    { no: 123, role: 'DOCTOR', prefix: 'doctor', label: '의사', bots: ['JOKER', ...C(5)] },
    { no: 124, role: 'GUARD', prefix: 'guard', label: '경비원', bots: ['JOKER', ...C(6)] },
    { no: 125, role: 'WITCH_HUNTER', prefix: 'witch-hunter', label: '마녀사냥꾼', bots: ['JOKER', ...C(8)] },
];
for (const c of JOB_WINS) {
    test(`${id(c.no)} ${c.bots.length + 1}명 판 ${c.label} 9승인 사람이 같은 직업으로 이김 → 10승 업적 알림, 골드 +10(업적) +1(판) @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const events = k.watchSocket(user.page);
        const { t, page } = await k.open(table, user, c.role, c.bots, { keepUser: true });
        // 옛 판 9승을 넣으면 판 수 3·승 10 업적 기준도 같이 넘음 → 둘은 이미 받은 것으로 적어 직업 10승만 새로 받게
        await k.seedGames(uid(user), 9, { role: c.role, won: true });
        await k.markGranted(uid(user), [GAMES_3, WINS_10]);
        const before = await k.gold(uid(user));
        // 광대인 나는 시민 봇 넷이 나가 1:1로 이김, 나머지 직업은 광대 봇 처형으로 이김
        if (c.role === 'JOKER') await jokerWin(t, page, t.bots.slice(1), t.bots[0]);
        else await citizenWin(t, page);
        await expect(k.banner(page)).toHaveText('승리');
        const jobWin10 = `${c.prefix}-win-10`;
        expect((await k.grantedIds(uid(user))).sort()).toEqual([GAMES_3, WINS_10, jobWin10].sort());
        expect(k.grantedEvents(events)).toEqual([jobWin10]);
        expect(await k.gold(uid(user))).toBe(before + 11);
    });
}

test(`${id(126)} 6명 판 승 9인 사람이 산 채로 나가고 내 편이 이김 → 승리 업적 없음 @game`, async ({ user, table }) => {
    const events = k.watchSocket(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)], { keepUser: true });
    await k.seedGames(uid(user), 9, { role: 'CITIZEN', won: true });
    await k.markGranted(uid(user), [GAMES_3]);
    await k.leaveAliveUi(page);
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.settled(t, t.bots[1]);
    // 이 판이 승으로 셌다면 승 10·귀족 10승 업적을 받았을 자리 → 둘 다 없음
    expect(await k.grantedIds(uid(user))).toEqual([GAMES_3]);
    expect(k.grantedEvents(events)).toEqual([]);
});

test(`${id(135)} 6명 판 이긴 편: 판 끝 뒤 마이페이지 판 수 +1, 승 +1 @game`, async ({ user, table }) => {
    const before = await readMyPage(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)], { keepUser: true });
    const statsBefore = await roleStats(page);
    await citizenWin(t, page);
    const stats = await roleStats(page);
    expect(totalOf(stats, 'wins')).toBe(totalOf(statsBefore, 'wins') + 1);
    const after = await readMyPage(page);
    expect(after.games).toBe(before.games + 1);
    // 승률 = 이긴 판 / 승패가 난 판 → 예: 첫 판을 이기면 "100.0%"
    expect(after.rate).toBe(`${((totalOf(stats, 'wins') / totalOf(stats, 'games')) * 100).toFixed(1)}%`);
    await expectReadable(statValue(page, '승률'));
});

test(`${id(136)} 7명 판 진 편: 판 끝 뒤 마이페이지 판 수 +1, 승은 그대로 @game`, async ({ user, table }) => {
    const before = await readMyPage(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(4)], { keepUser: true });
    const statsBefore = await roleStats(page);
    // 나머지 5(나 + 시민 봇 4)에서 셋이 나가 2:2 → 광대 승
    await jokerWin(t, page, t.bots.slice(3), t.bots[2]);
    const stats = await roleStats(page);
    expect(totalOf(stats, 'wins')).toBe(totalOf(statsBefore, 'wins'));
    expect(totalOf(stats, 'games')).toBe(totalOf(statsBefore, 'games') + 1);
    const after = await readMyPage(page);
    expect(after.games).toBe(before.games + 1);
});

test(`${id(137)} 8명 판 산 채로 나간 사람: 내 편이 이겨도 판 수 +1, 승은 그대로 @game`, async ({ user, table }) => {
    const before = await readMyPage(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)], { keepUser: true });
    const statsBefore = await roleStats(page);
    await k.leaveAliveUi(page);
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.settled(t, t.bots[1]);
    const stats = await roleStats(page);
    expect(totalOf(stats, 'wins')).toBe(totalOf(statsBefore, 'wins'));
    expect(totalOf(stats, 'games')).toBe(totalOf(statsBefore, 'games') + 1);
    const after = await readMyPage(page);
    expect(after.games).toBe(before.games + 1);
});
