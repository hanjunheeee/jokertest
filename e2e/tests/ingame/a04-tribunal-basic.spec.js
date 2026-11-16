'use strict';

// 재판 창 기본 브라우저 시험 (PC): 창·피고 카드·유죄/무죄가 읽힘, 피고·죽은 사람·낸 사람 안내 글, 누르면 서버가 받음, "재판 판정" 단추 없음, 창 뒤 판 잠김·Esc
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-001~006·013~015·019~020·082·084·172·179·180
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;

// n명 판(사람 시민, 첫 봇 광대)을 1일 재판까지: 피고는 셋째 봇(시민)
async function toTribunal(table, user, n, { settings = {} } = {}) {
    const t = await K.seat(table, user, { n, settings });
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    return { t, defendant, page: user.page };
}

[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`A04-E-00${i + 1} PC ${n}명 판 사람이 투표자 → 재판 창에 피고 카드·"유죄"·"무죄"가 읽힘 @game${smoke}`, async ({ user, table }) => {
        const { defendant, page } = await toTribunal(table, user, n);
        await K.expectDefendantCard(page, defendant.nickname, { name: true });
        await K.expectVoteButtons(page);
    });
});

test('A04-E-013 PC 6명 판 내가 피고 → "당신은 피고인입니다. 투표할 수 없습니다."가 읽히고 단추 없음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(user));
    await K.expectTribunal(user.page, user.account.nickname);
    await K.expectNotice(user.page, TEXT.DEFENDANT);
    await K.expectNoVoteButtons(user.page);
});

test('A04-E-014 PC 7명 판 1일 밤에 죽은 내가 2일 재판을 봄 → "사망한 참가자는 투표할 수 없습니다."가 읽히고 단추 없음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 7 });
    await K.toFirstDay(t);
    await K.killHumanAtNight(t, user, t.bots[0]);
    const defendant = t.bots[2];
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    await K.expectNotice(user.page, TEXT.DEAD);
    await K.expectNoVoteButtons(user.page);
});

test('A04-E-015 PC 8명 판 유죄를 낸 뒤 → "투표가 완료되었습니다."가 읽히고 단추 없음 @game', async ({ user, table }) => {
    const { page } = await toTribunal(table, user, 8);
    await K.press(page, TEXT.GUILTY);
    await K.expectNotice(page, TEXT.DONE);
    await K.expectNoVoteButtons(page);
});

test('A04-E-019 PC 6명 판 "유죄"를 누름 → 완료 글, 서버가 유죄 1표를 받음(나머지 기권 → 처형) @game', async ({ user, table }) => {
    const { t, defendant, page } = await toTribunal(table, user, 6);
    await K.press(page, TEXT.GUILTY);
    // /e2e 판 보기엔 재판 표 칸이 없음 → 봇이 아무도 안 낸 채 마감해 판정으로 봄 (유죄 1 : 무죄 0이라야 처형)
    const after = await K.closeTribunal(t);
    expect(after.phase).toBe('NIGHT');
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(false);
});

test('A04-E-020 PC 6명 판 "무죄"를 누름 → 완료 글, 서버가 무죄 1표를 받음(봇 유죄 1과 동점 → 처형 없음) @game', async ({ user, table }) => {
    const { t, defendant, page } = await toTribunal(table, user, 6);
    // 내 무죄가 안 들어가면 유죄 1 : 무죄 0으로 처형됨 → 동점이라 산 채면 서버가 무죄 1표를 받은 것
    expect((await K.botVerdict(t, t.bots[0], 'GUILTY')).ok).toBe(true);
    await K.press(page, TEXT.NOT_GUILTY);
    const after = await K.closeTribunal(t);
    expect(after.phase).toBe('NIGHT');
    expect(after.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(true);
});

test('A04-E-082 PC 6명 판 재판 중 → 화면에 "재판 판정" 단추·글 없음 (내기 전에도 낸 뒤에도) @game', async ({ user, table }) => {
    const { page } = await toTribunal(table, user, 6);
    await K.expectVoteButtons(page);
    await expect(page.getByRole('button', { name: '재판 판정' })).toHaveCount(0);
    await expect(page.getByText('재판 판정')).toHaveCount(0);
    await K.press(page, TEXT.GUILTY);
    await expect(page.getByRole('button', { name: '재판 판정' })).toHaveCount(0);
    await expect(page.getByText('재판 판정')).toHaveCount(0);
});

test('A04-E-084 PC 8명 판 재판 중 시간 바 → 행동 줄에 "재판 판정"·"낮 집계"·"밤 종료" 없음 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 8 });
    await K.toFirstDay(t);
    // 펼친 바에서 확인 (재판 창이 뜨면 판 화면이 잠겨 펼치기를 못 누름 → 낮에 펼쳐 둠)
    await K.expandBar(user.page);
    await K.openTribunal(t, uuidOf(t.bots[2]));
    await K.expectTribunal(user.page);
    const bar = K.timebar(user.page);
    await expect(bar).toContainText(TEXT.TRIBUNAL_BAR);
    for (const name of ['재판 판정', '낮 집계', '밤 종료']) {
        await expect(user.page.getByRole('button', { name })).toHaveCount(0);
        await expect(bar.getByText(name)).toHaveCount(0);
    }
    await expect(bar.getByLabel('단계 행동')).toHaveCount(0);
});

test('A04-E-172 PC 5명 판 재판 창 피고 카드 그림 = 판 카드 그림 @game', async ({ user, table }) => {
    const { defendant, page } = await toTribunal(table, user, 5);
    const sources = (card) => card.locator('img').evaluateAll((list) => list.map((img) => img.getAttribute('src')));
    const onBoard = await sources(K.night.cardButton(page, defendant.nickname));
    const inTribunal = await sources(K.tribunalCard(page, defendant.nickname));
    expect(onBoard.length).toBeGreaterThan(0);
    expect(inTribunal).toEqual(onBoard);
});

test('A04-E-179 [지금 동작] PC 6명 판 재판 창 뒤 카드를 누름 → 카드 메뉴 안 열림 @game', async ({ user, table }) => {
    const { t, page } = await toTribunal(table, user, 6);
    const card = K.night.cardButton(page, t.bots[1].nickname);
    // 재판 창이 덮은 자리라 그 자리를 그대로 누름 (누를 수 있는지 기다리지 않음)
    await card.click({ force: true });
    await expect(K.cardMenu(page)).toHaveCount(0);
    expect(await card.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
    await K.expectVoteButtons(page);
});

test('A04-E-180 [지금 동작] PC 7명 판 재판 창에서 Esc → 창 그대로 @game', async ({ user, table }) => {
    const { t, page } = await toTribunal(table, user, 7);
    await page.keyboard.press('Escape');
    // 서버까지 한 번 다녀온 뒤에도 그대로인지 (바로 보면 닫히기 전일 수 있음)
    expect((await t.state()).phase).toBe('TRIBUNAL');
    await expect(K.tribunal(page)).toBeVisible();
    await K.expectVoteButtons(page);
});
