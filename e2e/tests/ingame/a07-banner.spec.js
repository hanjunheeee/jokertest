'use strict';

// 결과 화면 띠 브라우저 시험 (PC) — 내 편 승패 띠("승리"·"패배")와 이긴 진영 띠가 읽힘, 산 채로 나간 사람은 편이 이겨도 전적은 패
// 목록 시험목록/A07-승패-결과-골드.md A07-E-040~045, 모이는지만 봄: npx playwright test --list tests/ingame/a07-banner.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const k = require('./_a07-simple-kit');

const { C, uid } = k;

// 이긴 진영 띠
const teamBadge = (page, winner) => page.getByText(k.WIN_TEXT[winner], { exact: true });

// 시민 승으로 끝내고 결과판까지: 봇 표로 광대(t.bots[0]) 처형
async function citizenWin(t, page) {
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.reachBoard(page);
}

// 광대 승으로 끝내고 결과판까지: 광대 2명 판에서 시민 봇이 나가 2:2
async function jokerWin(t, page, leavers) {
    for (const bot of leavers) await k.leave(t, bot);
    expect((await t.state()).winResult?.winner).toBe('JOKER');
    await k.reachBoard(page);
}

test('A07-E-040 6명 판 이긴 편: 결과 화면 맨 위 "승리" @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
    await citizenWin(t, page);
    await expect(k.banner(page)).toHaveText('승리');
    await expectReadable(k.banner(page));
});

test('A07-E-041 7명 판 진 편: 결과 화면 맨 위 "패배" @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(4)]);
    // 나머지 5(나 + 시민 봇 4)에서 셋이 나가 2:2
    await jokerWin(t, page, t.bots.slice(3));
    await expect(k.banner(page)).toHaveText('패배');
    await expectReadable(k.banner(page));
});

test('A07-E-042 8명 판 시민 승 → "시민 진영 승리" 띠 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    await citizenWin(t, page);
    await expectReadable(teamBadge(page, 'CITIZEN'));
    await expect(teamBadge(page, 'JOKER')).toHaveCount(0);
});

test('A07-E-043 5명 판 광대 승 → "광대 진영 승리" 띠 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(2)]);
    await jokerWin(t, page, [t.bots[2]]);
    await expectReadable(teamBadge(page, 'JOKER'));
    await expect(teamBadge(page, 'CITIZEN')).toHaveCount(0);
});

test('A07-E-044 10명 판 승패 띠·진영 띠 글이 사람 눈에 읽힘 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(8)]);
    await citizenWin(t, page);
    await expect(k.rows(page)).toHaveCount(10);
    await expectReadable(k.banner(page));
    await expectReadable(teamBadge(page, 'CITIZEN'));
});

test('A07-E-045 6명 판 시민인 내가 산 채로 나감, 시민 승 → DB 내 전적 won은 거짓(패) @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(4)]);
    const stayed = t.bots[1];
    await k.leaveAliveUi(page);
    const end = await k.execute(t, uid(t.bots[0]));
    expect(end.winResult?.winner).toBe('CITIZEN');
    // 전적이 저장될 때까지 (판 끝 저장은 판 끝 방송 뒤에 따로 돎)
    const rowsOf = () => query('SELECT user_id, won, death_reason FROM game_result_players WHERE game_id = ?', [t.gameId]);
    await expect.poll(async () => (await rowsOf()).length, { timeout: 30_000, message: '전적 줄 저장' }).toBe(6);
    const saved = await rowsOf();
    const mine = saved.find((r) => r.user_id === uid(user));
    const theirs = saved.find((r) => r.user_id === uid(stayed));
    // 같은 시민 편인데 끝까지 있던 봇은 승, 나간 나는 패 (빈 값(null)이 아니라 거짓이어야 함)
    const wonOf = (row) => (row.won === null ? null : Boolean(row.won));
    expect({ won: wonOf(mine), why: mine.death_reason }).toEqual({ won: false, why: 'DISCONNECT' });
    expect(wonOf(theirs)).toBe(true);
});
