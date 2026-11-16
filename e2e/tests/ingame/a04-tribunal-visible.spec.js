'use strict';

// 재판 창이 여러 화면 크기·상황에서 보이는지 브라우저 시험 (PC): 작은 창·큰 창·200% 확대·설정 창을 열어 둔 채·긴 닉네임 피고
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-124·125·132·133·177
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a04-pc');

const { uuidOf } = K;

// n명 판을 낮까지 간 뒤 창 크기를 바꾸고(대기방 화면은 이 시험이 볼 것이 아님) 1일 재판 → 피고 카드·단추가 화면 안·안 가려진 채 읽히는지
async function expectTribunalFits(table, user, n, viewport) {
    const t = await K.seat(table, user, { n });
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await user.page.setViewportSize(viewport);
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(user.page, defendant.nickname);
    await K.expectDefendantCard(user.page, defendant.nickname);
    await K.expectVoteButtons(user.page);
}

test('A04-E-124 PC 6명 판 작은 창(1280x720) → 재판 단추·피고 카드가 화면 안·안 가려짐 @game @smoke', async ({ user, table }) => {
    await expectTribunalFits(table, user, 6, { width: 1280, height: 720 });
});

test('A04-E-125 PC 8명 판 큰 창(1920x1080) → 재판 단추·피고 카드가 화면 안·안 가려짐 @game', async ({ user, table }) => {
    await expectTribunalFits(table, user, 8, { width: 1920, height: 1080 });
});

test('A04-E-133 PC 5명 판 화면 200% 확대 → 재판 단추가 화면 안·안 가려짐 @game', async ({ user, table }) => {
    // 1280x800 창을 200%로 키우면 글·칸이 두 배 = 화면이 640x400만큼만 보이는 것과 같음
    await expectTribunalFits(table, user, 5, { width: 640, height: 400 });
});

test('A04-E-132 PC 6명 판 판 중 설정 창을 열어 둔 채 재판 → 재판 단추가 안 가려짐 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 6 });
    const page = user.page;
    const defendant = t.bots[2];
    await K.toFirstDay(t);
    await page.getByRole('button', { name: '인게임 설정', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '인게임 설정', exact: true })).toBeVisible();
    await K.openTribunal(t, uuidOf(defendant));
    await K.expectTribunal(page, defendant.nickname);
    await K.expectVoteButtons(page);
    await K.press(page, K.TEXT.GUILTY);
});

// 가장 긴 닉네임: 8자(가입 규칙 2~8자), 글자 폭이 넓은 한글로 — 겹치지 않게 뒤 5자는 무작위
function longNickname() {
    const pool = '가나다라마바사아자차카타파하';
    return `긴이름${Array.from({ length: 5 }, () => pool[Math.floor(Math.random() * pool.length)]).join('')}`;
}

test('A04-E-177 PC 7명 판 가장 긴 닉네임(8자) 피고 → 재판 창 카드 이름이 읽히고 단추가 안 밀려남 @game', async ({ user, table, accounts, players }) => {
    // 봇 닉네임은 판 차리기가 정해서 못 바꿈 → 긴 닉네임 계정을 브라우저 사람으로 한 명 더 앉혀 피고로 세움
    const nickname = longNickname();
    expect(nickname).toHaveLength(8);
    const long = await players.add({ account: await accounts.create({ nickname }) });
    const t = await K.seat(table, user, { n: 7, others: [long] });
    await K.toFirstDay(t);
    await K.openTribunal(t, uuidOf(long));
    const page = user.page;
    await K.expectTribunal(page, nickname);
    await K.expectDefendantCard(page, nickname, { name: true });
    // 이름 글이 잘리지 않음 (칸보다 길면 말줄임으로 잘림)
    const cut = await K.tribunalCard(page, nickname).locator('p > span').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(cut).toBe(false);
    await K.expectVoteButtons(page);
});
