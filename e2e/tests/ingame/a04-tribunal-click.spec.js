'use strict';

// 재판 누르기 브라우저 시험 (PC): 빨리 두 번 눌러도 표 하나, 유죄 뒤 바로 무죄를 눌러도 유죄만, 카드 메뉴 길(재판 창이 판을 덮음), 피고 아닌 카드엔 재판 항목 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-140·142·143·144
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// n명 판(사람 시민)을 1일 재판까지 → 피고는 셋째 봇(시민), voters = 표 낼 봇
async function toTribunal(table, user, n) {
    const t = await K.seat(table, user, { n });
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    return { t, defendant, page: user.page, voters: t.bots.filter((b) => b !== defendant) };
}

const aliveOf = (s, bot) => s.players.find((p) => p.uuid === uuidOf(bot)).alive;

test('A04-E-140 PC 7명 판 "유죄"를 빨리 두 번 누름 → 서버 표는 하나 (봇 유죄 1 : 무죄 2에 내 1표 → 2 : 2 무죄) @game @smoke', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 7);
    await K.botsVerdict(t, 'GUILTY', voters.slice(0, 1));
    await K.botsVerdict(t, 'NOT_GUILTY', voters.slice(1, 3));
    await expect(K.guilty(page)).toBeEnabled();
    await K.guilty(page).dblclick();
    await K.expectNotice(page, TEXT.DONE);
    // 두 표로 세였다면 3 : 2로 처형, 하나라 동점 → 산 채
    const after = await K.closeTribunal(t);
    expect(aliveOf(after, defendant)).toBe(true);
});

test('A04-E-142 PC 8명 판 "유죄" 뒤 바로 "무죄"를 누름 → 서버 표는 유죄 하나 (봇 유죄 1 : 무죄 1에 내 유죄 → 2 : 1 처형) @game', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 8);
    await K.botsVerdict(t, 'GUILTY', voters.slice(0, 1));
    await K.botsVerdict(t, 'NOT_GUILTY', voters.slice(1, 2));
    // 단추가 제자리에 다 나온 뒤(움직임 끝) 두 자리를 미리 재 두고 기다림 없이 연달아 누름
    await K.expectVoteButtons(page);
    const g = await K.guilty(page).boundingBox();
    const n = await K.notGuilty(page).boundingBox();
    await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.click(n.x + n.width / 2, n.y + n.height / 2);
    await K.expectNotice(page, TEXT.DONE);
    // 무죄로 바뀌었다면 1 : 2, 둘 다 세였다면 2 : 2 → 어느 쪽이든 산 채. 유죄 하나만 들어가야 처형
    const after = await K.closeTribunal(t);
    expect(aliveOf(after, defendant)).toBe(false);
});

test('A04-E-143 PC 6명 판 재판 중 피고 판 카드는 재판 창에 덮여 메뉴가 안 열림 → 유죄는 재판 창 단추로 내고 서버가 받음 @game', async ({ user, table }) => {
    const { t, defendant, page } = await toTribunal(table, user, 6);
    // 목록의 "카드 메뉴로 유죄" 길은 지금 화면에 없음: 재판 창이 뜨면 판 화면이 잠김 → 그 자리를 눌러도 메뉴가 안 열림
    const boardCard = K.night.cardButton(page, defendant.nickname);
    await boardCard.click({ force: true });
    await expect(K.cardMenu(page)).toHaveCount(0);
    expect(await boardCard.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
    await K.press(page, TEXT.GUILTY);
    // 봇은 아무도 안 냄 → 내 유죄 1표로 처형
    const after = await K.closeTribunal(t);
    expect(aliveOf(after, defendant)).toBe(false);
});

test('A04-E-144 PC 7명 판 재판 중 피고 아닌 카드를 누름 → 메뉴에 "유죄"·"무죄" 없음 @game', async ({ user, table }) => {
    const { t, page } = await toTribunal(table, user, 7);
    await K.night.cardButton(page, t.bots[1].nickname).click({ force: true });
    // 재판 창 단추 둘 말고는 화면 어디에도 유죄·무죄 항목이 없음
    await expect(page.getByRole('menuitem', { name: TEXT.GUILTY })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: TEXT.NOT_GUILTY })).toHaveCount(0);
    await expect(page.getByRole('button', { name: TEXT.GUILTY, exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: TEXT.NOT_GUILTY, exact: true })).toHaveCount(1);
});
