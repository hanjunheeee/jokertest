'use strict';

// 공개 방 목록으로 대기방 들어오기 브라우저 시험 (PC) — 줄 이름·인원, 코드 방은 코드 입력 쪽, 정원마다 "마감", 고른 사이 참·사라짐 글, 목록 저절로 바뀜, 3번 쫓겨남·탈주 거절
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-523~540 — 공개 방 입장 거절은 서버 글을 그대로 브라우저 알림 창에 띄움
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('./_a01b-join-kit');

const { R, W, seats, MSG } = K;

test('A01-E-523 목록에서 공개 방 고름 (정원 6 · 봇 3) → 줄 "○○의 방" "3/6" → 입장 → 대기방, 인원 4 @smoke', async ({ user, bots }) => {
    const page = user.page;
    const { title } = await K.botRoom(bots, { max: 6, count: 3, accessType: 'open' });
    const row = await K.pickRow(page, title);
    await expect(row).toHaveAttribute('aria-label', new RegExp(`^${title}, 3/6명`));
    await K.enterButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/);
    await K.expectParty(page, 4);
});

test('A01-E-524 코드 방은 코드 입력 쪽 (정원 8 · 봇 2, 코드 방) → "코드 입력" 단추, 바로 입장 안 됨', async ({ user, bots }) => {
    const page = user.page;
    const { title, host } = await K.botRoom(bots, { max: 8, count: 2, accessType: 'code' });
    await K.pickRow(page, title);
    const toCode = page.getByRole('button', { name: '코드 입력' });
    await expect(toCode).toBeEnabled();
    await expect(K.enterButton(page)).toHaveCount(0);
    await toCode.click();
    // 코드 입력 화면으로 감 (대기방 아님), 서버 방 인원 그대로
    await expect(page).toHaveURL(/\/roomInvite/);
    expect(await K.roomSize(host.uuid)).toBe(2);
});

// 정원마다 꽉 찬 공개 방 → "마감" (값 하나 = 케이스 하나)
const FULL_ROWS = [
    ['A01-E-525', 5], ['A01-E-526', 6], ['A01-E-527', 7], ['A01-E-528', 8], ['A01-E-529', 9], ['A01-E-530', 10],
];
for (const [id, max] of FULL_ROWS) {
    test(`${id} 정원 ${max} 꽉 찬 봇 방 → 줄 "마감" 배지 보임, 입장 단추 꺼짐`, async ({ user, bots }) => {
        const page = user.page;
        const { title } = await K.botRoom(bots, { max, count: max, accessType: 'open' });
        const row = await K.findRow(page, title);
        await expect(row).toHaveAttribute('aria-label', new RegExp(`^${title}, ${max}/${max}명.*, 마감$`));
        // 배지는 눌림을 안 받는 글(pointer-events:none)이라 가운데 점 검사는 늘 부모를 집음 → 가려짐 검사만 뺌
        await expectReadable(row.getByText('마감', { exact: true }), { uncovered: false });
        // 꽉 찬 줄은 못 고름, 고른 방이 없으니 입장 단추도 꺼짐
        await expect(row).toBeDisabled();
        await expect(K.enterButton(page)).toBeDisabled();
    });
}

test('A01-E-531 꽉 차기 직전엔 들어감 (정원 7 · 봇 6) → "6/7" 고름 → 입장, 그 뒤 목록 "마감"', async ({ user, players, bots }) => {
    const page = user.page;
    const { title } = await K.botRoom(bots, { max: 7, count: 6, accessType: 'open' });
    const row = await K.pickRow(page, title);
    await expect(row).toHaveAttribute('aria-label', new RegExp(`^${title}, 6/7명`));
    await K.enterButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/);
    // 다른 사람 목록에서는 그 방이 "마감" (들어간 나는 대기방이라 따로 보는 사람으로 봄)
    const viewer = await players.add();
    const viewerRow = await K.findRow(viewer.page, title);
    await expect(viewerRow).toHaveAttribute('aria-label', /, 7\/7명.*, 마감$/);
});

test('A01-E-532 고른 사이 찼으면 글 (정원 5 · 봇 4) → 줄 고른 뒤 봇이 먼저 들어감 → 입장 → "방이 가득 찼습니다."', async ({ user, bots }) => {
    const page = user.page;
    // 목록 갱신 방송이 늦게 온 때를 만듦: 고른 뒤부터 그 방송만 화면에 안 넘김 (안 막으면 줄이 "마감"으로 바뀌어 못 누름)
    const lateList = K.eventFrame('public_rooms_updated');
    const tap = await K.tapSocket(page, { down: (m, t) => (t.on && lateList(m) ? 'drop' : null) });
    const { title, room } = await K.botRoom(bots, { max: 5, count: 4, accessType: 'open' });
    const row = await K.pickRow(page, title);
    await expect(row).toHaveAttribute('aria-label', new RegExp(`^${title}, 4/5명`));
    tap.on = true;
    await K.addBots(bots, room, 1);
    const text = await ui.captureAlert(page, () => K.enterButton(page).click());
    expect(text).toBe(MSG.FULL);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-533 시작된 방은 목록에서 사라짐 (정원 5 · 봇 5 방) → 보는 중 판 시작 → 그 줄 사라짐(새로고침 없이) @game', async ({ user, bots }) => {
    const page = user.page;
    const r = await K.botRoom(bots, { max: 5, count: 5, accessType: 'open', ready: true, settings: K.customRoleSettings({ JOKER: 1 }) });
    const { title, host, room } = r;
    await K.fixBotRoles(r);
    await K.findRow(page, title);
    await host.startGame(room.roomId, room.settingsVersion);
    await expect.poll(() => K.rowLabel(page, title), { timeout: 15_000, message: '목록에서 그 줄' }).toBeNull();
    await expect(page).toHaveURL(/\/multiplay/);
});

test('A01-E-534 3번 쫓겨난 공개 방 (정원 7) → 목록 입장 → "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { title, code, host } = await K.botRoom(bots, { max: 7, count: 2, accessType: 'open' });
    await K.kickedThrice(user, host, code);
    await K.pickRow(page, title);
    expect(await ui.captureAlert(page, () => K.enterButton(page).click())).toBe(MSG.KICK3);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-535 탈주 대기 중 공개 입장 (정원 6) → "탈주로 …뒤에 참여할 수 있습니다." @game', async ({ user, bots, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { title } = await K.botRoom(bots, { max: 6, count: 2, accessType: 'open' });
    await K.desert(table, user);
    await K.pickRow(page, title);
    expect(await ui.captureAlert(page, () => K.enterButton(page).click())).toMatch(K.DESERTED);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-536 봇이 들어오면 목록 인원이 바뀜 (정원 9 · 봇 2) → 보는 중 봇 1 입장 → 줄 3/9 (새로고침 없이)', async ({ user, bots }) => {
    const page = user.page;
    const { title, room } = await K.botRoom(bots, { max: 9, count: 2, accessType: 'open' });
    const row = await K.findRow(page, title);
    await expect(row).toHaveAttribute('aria-label', new RegExp(`^${title}, 2/9명`));
    await K.addBots(bots, room, 1);
    await expect.poll(() => K.rowLabel(page, title), { timeout: 15_000 }).toMatch(new RegExp(`^${title}, 3/9명`));
    await expect(page).toHaveURL(/\/multiplay/);
});

test('A01-E-537 방이 없어지면 목록에서 빠짐 (정원 6 · 봇 1) → 봇 방장 방 삭제 → 줄 사라짐', async ({ user, bots }) => {
    const page = user.page;
    const { title, host } = await K.botRoom(bots, { max: 6, count: 1, accessType: 'open' });
    await K.findRow(page, title);
    await K.botDelete(host);
    await expect.poll(() => K.rowLabel(page, title), { timeout: 15_000, message: '목록에서 그 줄' }).toBeNull();
});

test('A01-E-538 사라진 방 고름 (정원 6) → 줄 고른 뒤 봇이 방 삭제 → 입장 → "공개 방을 찾을 수 없습니다."', async ({ user, bots }) => {
    const page = user.page;
    // 목록 갱신 방송이 늦게 온 때: 고른 뒤 그 방송만 막음 (안 막으면 고른 줄이 사라져 입장 단추가 꺼짐)
    const lateList = K.eventFrame('public_rooms_updated');
    const tap = await K.tapSocket(page, { down: (m, t) => (t.on && lateList(m) ? 'drop' : null) });
    const { title, host } = await K.botRoom(bots, { max: 6, count: 2, accessType: 'open' });
    await K.pickRow(page, title);
    tap.on = true;
    await K.botDelete(host);
    expect(await ui.captureAlert(page, () => K.enterButton(page).click())).toBe(MSG.PUBLIC_GONE);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-539 목록 줄 이름은 방장 닉네임의 방 (정원 10 · 봇 방장) → 줄 이름 "{봇 닉네임}의 방"', async ({ user, bots }) => {
    const page = user.page;
    const { title, host } = await K.botRoom(bots, { max: 10, count: 1, accessType: 'open' });
    expect(title).toBe(`${host.nickname}의 방`);
    const row = await K.findRow(page, title);
    await expect(row).toHaveAttribute('aria-label', new RegExp(`^${title}, 1/10명`));
    await expect(row.getByText(title, { exact: true })).toBeVisible();
});

test('A01-E-540 들어온 사람도 "대기중" (정원 6 · 봇 4) → 공개 입장 → 내 자리 "대기중"', async ({ user, bots }) => {
    const page = user.page;
    const { title } = await K.botRoom(bots, { max: 6, count: 4, accessType: 'open', ready: true });
    await K.pickRow(page, title);
    await K.enterButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/);
    await K.expectSeats(page, seats(R, 4, W));
});
