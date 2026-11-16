'use strict';

// 재판 판정 브라우저 시험 (PC): 시간 끝 판정(아무도 안 냄·1표·동점, 진짜 15초), 유죄면 추방 글, 무죄면 밤 안내, 피고 카드 생사, 처형 직업·표 수가 화면에 안 나옴
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-038·040~043·045·047·048·050·052
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { TEXT, uuidOf } = K;
const SLACK_MS = 1500;

// n명 판을 1일 재판까지, 화면 기록도 검 → 피고는 defendantIndex번 봇
async function toTribunal(table, user, n, { tribunalTime = 120, bots = ['JOKER'], defendantIndex = 2 } = {}) {
    const t = await K.seat(table, user, { n, bots, settings: { tribunalTime } });
    const defendant = t.bots[defendantIndex];
    await K.toFirstDay(t);
    await K.watchScreen(user.page);
    const { deadline } = await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    return { t, defendant, deadline, page: user.page, voters: t.bots.filter((b) => b !== defendant) };
}

// 재판 15초를 진짜로 기다림 → 원래 마감(±1.5초)에 창이 닫혔는지
async function waitRealDeadline(page, deadline) {
    await expect(K.tribunal(page)).toBeHidden({ timeout: 18_000 });
    const rec = await K.readScreen(page);
    expect(Math.abs(rec.closed.at(-1) - deadline)).toBeLessThanOrEqual(SLACK_MS);
}

// 무죄 쪽: 추방 연출이 한 번도 안 뜨고 밤 안내가 읽힘, 피고는 서버·카드 다 산 채
async function expectReleased({ t, page, defendant }) {
    await K.expectNightNotice(page);
    expect((await K.readScreen(page)).expulsions).toHaveLength(0);
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(s.players.find((p) => p.uuid === uuidOf(defendant)).alive).toBe(true);
    await K.night.expectCard(page, defendant.nickname, 'alive');
}

test('A04-E-038 PC 5명 판 재판 15초, 아무도 안 냄 → 15초 뒤 추방 글 없이 밤, 피고 산 채 @game @realtime @smoke', async ({ user, table }) => {
    const ctx = await toTribunal(table, user, 5, { tribunalTime: 15 });
    await waitRealDeadline(ctx.page, ctx.deadline);
    await expectReleased(ctx);
});

test('A04-E-040 PC 7명 판 재판 15초, 나만 유죄(나머지 기권) → 15초 뒤 추방 글 @game @realtime', async ({ user, table }) => {
    const { t, defendant, deadline, page } = await toTribunal(table, user, 7, { tribunalTime: 15 });
    await K.press(page, TEXT.GUILTY);
    await waitRealDeadline(page, deadline);
    await K.expectExpelled(page, defendant.nickname);
    expect((await t.player(uuidOf(defendant))).alive).toBe(false);
});

test('A04-E-041 PC 6명 판 재판 15초, 나만 무죄(나머지 기권) → 15초 뒤 밤, 처형 없음 @game @realtime', async ({ user, table }) => {
    const ctx = await toTribunal(table, user, 6, { tribunalTime: 15 });
    await K.press(ctx.page, TEXT.NOT_GUILTY);
    await waitRealDeadline(ctx.page, ctx.deadline);
    await expectReleased(ctx);
});

test('A04-E-042 PC 8명 판 재판 15초, 내 유죄 + 봇 무죄 1(나머지 기권) → 15초 뒤 밤, 피고 산 채 @game @realtime', async ({ user, table }) => {
    const ctx = await toTribunal(table, user, 8, { tribunalTime: 15 });
    await K.press(ctx.page, TEXT.GUILTY);
    expect((await K.botVerdict(ctx.t, ctx.voters[0], 'NOT_GUILTY', 1)).ok).toBe(true);
    await waitRealDeadline(ctx.page, ctx.deadline);
    await expectReleased(ctx);
});

test('A04-E-043 PC 7명 판 유죄 → "[닉네임]님이 가면무도회에서 추방당하셨습니다."가 읽힘 @game', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 7);
    await K.botsVerdict(t, 'GUILTY', voters);
    await K.closeTribunal(t);
    await K.expectExpelled(page, defendant.nickname);
});

test('A04-E-045 PC 8명 판 무죄 → 추방 글 없이 "밤이 되었습니다" 안내 @game', async ({ user, table }) => {
    const ctx = await toTribunal(table, user, 8);
    await K.botsVerdict(ctx.t, 'NOT_GUILTY', ctx.voters);
    await K.closeTribunal(ctx.t);
    await expectReleased(ctx);
    await expect(ctx.page.getByText(TEXT.expel(ctx.defendant.nickname))).toHaveCount(0);
});

test('A04-E-047 PC 6명 판 동점(내 유죄 1 : 봇 무죄 1) 무죄 → 피고 카드는 산 사람("사망" 아님) @game', async ({ user, table }) => {
    const ctx = await toTribunal(table, user, 6);
    await K.press(ctx.page, TEXT.GUILTY);
    expect((await K.botVerdict(ctx.t, ctx.voters[0], 'NOT_GUILTY')).ok).toBe(true);
    await K.closeTribunal(ctx.t);
    await expectReleased(ctx);
    await expect(K.night.cardButton(ctx.page, ctx.defendant.nickname)).not.toContainText('사망');
});

test('A04-E-048 PC 10명 판 유죄 → 피고 카드에 사망 표시 @game', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 10);
    await K.botsVerdict(t, 'GUILTY', voters);
    await K.closeTribunal(t);
    await K.passExpulsion(page);
    await K.night.expectCard(page, defendant.nickname, 'dead');
    // 그림만으로는 모르니 읽어 주는 글도 "사망"
    await expect(K.night.cardButton(page, defendant.nickname)).toContainText('사망');
});

test('A04-E-050 PC 8명 판 피고 = 광대(광대 2 중 1) 유죄 → 판정 뒤 화면 글에 "광대" 없음 @game', async ({ user, table }) => {
    // 광대가 하나 남아 판이 안 끝남 (끝나면 결과 화면이 직업을 다 보여 줌)
    const { t, defendant, page, voters } = await toTribunal(table, user, 8, { bots: ['JOKER', 'JOKER'], defendantIndex: 0 });
    await K.botsVerdict(t, 'GUILTY', voters);
    await K.closeTribunal(t);
    await K.expectExpelled(page, defendant.nickname);
    // 추방 글이 떠 있는 동안 화면 전체 글 (밤 차례 안내는 연출이 끝난 뒤에야 뜸)
    expect(await page.locator('body').innerText()).not.toContain('광대');
    await K.passExpulsion(page);
    await K.night.expectCard(page, defendant.nickname, 'dead');
    await expect(K.night.cardButton(page, defendant.nickname)).not.toContainText('광대');
    for (const row of (await K.readScreen(page)).expulsions) expect(row.text).not.toContain('광대');
});

test('A04-E-052 PC 7명 판 유죄 3 : 무죄 2 → 화면에 표 수 글 없음 @game', async ({ user, table }) => {
    const { t, defendant, page, voters } = await toTribunal(table, user, 7);
    await K.press(page, TEXT.GUILTY);
    await K.botsVerdict(t, 'GUILTY', voters.slice(0, 2));
    await K.botsVerdict(t, 'NOT_GUILTY', voters.slice(2, 4));
    await K.closeTribunal(t);
    await K.expectExpelled(page, defendant.nickname);
    const COUNT_TEXT = /(유죄|무죄)\s*:?\s*\d|\d+\s*표|\d\s*대\s*\d/;
    expect(await page.locator('body').innerText()).not.toMatch(COUNT_TEXT);
    // 추방 연출에 나온 글은 추방 글 하나뿐 (영상 단계엔 글 없음)
    for (const row of (await K.readScreen(page)).expulsions) expect(['', TEXT.expel(defendant.nickname), '건너뛰기']).toContain(row.text);
    await K.passExpulsion(page);
    expect(await page.locator('body').innerText()).not.toMatch(COUNT_TEXT);
});
