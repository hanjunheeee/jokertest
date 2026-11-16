'use strict';

// PC 방 설정 바꾸기 브라우저 시험 — 방장만 단추, 창에 지운 3칸 없음, 칸 바꿔 저장(서버·화면 새 값), 바꾸면 전원 준비 풀림·같은 값은 그대로, 정원 줄이기 거절, 끝값 단추, 취소, 저장 중 꺼짐, 손님 화면, 키보드
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-043~066, 돌리지 않고 모임만: npx playwright test --list tests/room/a01-settings-edit.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { botsJoinAndReady, botUpdateSettings, readySilhouettes } = require('./roomHelpers');
const K = require('./_a01a-kit');

const editor = (page) => page.getByRole('dialog', { name: '방 설정 변경' });
const readyCount = (room) => room.players.filter((p) => p.isReady).length;

/** 사람 방장 방 + 봇 n 들어와 준비 → 서버 방 요약 */
async function hostRoomWithBots(user, bots, n, settings = {}) {
    const room = await K.createRoomOn(user, settings);
    const list = n > 0 ? await bots.spawn(n) : [];
    if (n > 0) await botsJoinAndReady(list, K.U(user), room.roomCode);
    await expect.poll(async () => readyCount(await e2e.roomOf(K.U(user)))).toBe(n);
    return { room, list };
}

/** 봇 방장 공개 방에 사람 손님 (코드 입장) → { host, room } */
async function guestInBotRoom(user, bots, settings = {}) {
    const [host] = await bots.spawn(1);
    const room = await host.createRoom({ accessType: 'open', maxPlayers: 10, ...settings });
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    return { host, room };
}

test('A01-E-043 사람 방장 → "방 설정 변경" 단추 읽힘 @smoke', async ({ user }) => {
    await K.createRoomOn(user);
    await expectReadable(user.page.getByRole('button', { name: '방 설정 변경', exact: true }));
});

test('A01-E-044 사람 손님(봇 방장 방) → "방 설정 변경" 단추 없음', async ({ user, bots }) => {
    await guestInBotRoom(user, bots);
    await expect(user.page.getByRole('button', { name: '준비완료' })).toBeVisible();
    await expect(user.page.getByRole('button', { name: '방 설정 변경', exact: true })).toHaveCount(0);
});

test('A01-E-045 설정 바꾸기 창 두 탭 → "불이 꺼진 무도회"·"영혼의 베팅"·"투표 공개" 없음', async ({ user }) => {
    await K.createRoomOn(user);
    await K.openEditor(user.page);
    await K.expectNoRemovedFields(user.page, editor(user.page));
});

test('A01-E-046 정원 10→8 저장 → 서버 정원 8, 대기방 "1/8", 다시 연 창도 8', async ({ user }) => {
    const page = user.page;
    await K.createRoomOn(user);
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 8 });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.maxPlayers).toBe(8);
    await expect(K.capacity(page)).toHaveText('1/8');
    await K.openEditor(page);
    expect(await K.numberOf(page, K.L.MAX)).toBe(8);
});

test('A01-E-047 공개→코드 저장 → 서버 공개 방식 code, 다시 연 창 "코드로만 참가" 켜짐', async ({ user }) => {
    const page = user.page;
    const room = await K.createRoomOn(user, { code: false });
    await K.openEditor(page);
    await K.fill(page, { code: true });
    await K.saveEditor(page);
    await expect.poll(async () => (await K.liveRoom(room.roomId))?.accessType).toBe('code');
    await K.openEditor(page);
    await expect(page.getByRole('checkbox', { name: K.L.CODE_ONLY, exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('A01-E-048 광대 2→1 저장 → 서버 광대 1, 다시 연 창 광대 1', async ({ user }) => {
    const page = user.page;
    await K.createRoomOn(user);
    await K.openEditor(page);
    await K.fill(page, { jokers: 1 });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.jokerCount).toBe(1);
    await K.openEditor(page);
    expect(await K.numberOf(page, K.L.JOKER)).toBe(1);
});

test('A01-E-049 토론 60→120 저장 → 서버 토론 120, 다시 연 창 토론 120초', async ({ user }) => {
    const page = user.page;
    await K.createRoomOn(user);
    await K.openEditor(page);
    await K.fill(page, { discussion: 120 });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.dayDiscussionTime).toBe(120);
    await K.openEditor(page);
    await K.selectTab(page, '회의&투표');
    expect(await K.valueOf(page, K.L.TALK)).toBe('120초');
});

test('A01-E-050 사람 손님 준비 → 봇 방장이 설정 바꿈 → 사람 단추 "준비완료"로 돌아감', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestInBotRoom(user, bots);
    await K.readyMe(page);
    const r = await botUpdateSettings(host, { dayDiscussionTime: 90 });
    expect(r?.ok, `설정 바꾸기 답 ${JSON.stringify(r)}`).toBe(true);
    await expect(page.getByRole('button', { name: '준비완료' })).toBeVisible();
    await expect(page.getByRole('button', { name: '준비취소' })).toHaveCount(0);
});

test('A01-E-051 사람 방장 + 봇 4 준비 → 설정 바꿈 → 서버 봇 4 준비 풀림, 자리 준비 표시 0', async ({ user, bots }) => {
    const page = user.page;
    await hostRoomWithBots(user, bots, 4);
    await expect(readySilhouettes(page)).toHaveCount(4);
    await K.openEditor(page);
    await K.fill(page, { discussion: 90 });
    await K.saveEditor(page);
    await expect.poll(async () => readyCount(await e2e.roomOf(K.U(user)))).toBe(0);
    await expect(readySilhouettes(page)).toHaveCount(0);
});

test('A01-E-052 봇 4 준비, 아무것도 안 바꾸고 저장 → 봇 준비 그대로', async ({ user, bots }) => {
    const page = user.page;
    const { room } = await hostRoomWithBots(user, bots, 4);
    await K.openEditor(page);
    await K.saveEditor(page);
    const after = await e2e.roomOf(K.U(user));
    expect(readyCount(after)).toBe(4);
    expect(after.settingsVersion, '설정 버전 그대로').toBe(room.settingsVersion);
    await expect(readySilhouettes(page)).toHaveCount(4);
});

test('A01-E-053 사람 방장 + 봇 6 = 7명, 정원 6 저장 → "현재 인원(7명)보다…" 글 읽힘, 서버 정원 그대로', async ({ user, bots }) => {
    const page = user.page;
    await hostRoomWithBots(user, bots, 6);
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 6 });
    await page.getByRole('button', { name: '설정 저장', exact: true }).click();
    const error = editor(page).getByRole('alert').filter({ hasText: K.MSG.BELOW_OCCUPANCY(7) });
    await expect(error).toHaveText(K.MSG.BELOW_OCCUPANCY(7));
    await expectReadable(error);
    expect((await e2e.roomOf(K.U(user))).settings.maxPlayers).toBe(10);
});

test('A01-E-054 7명 방 정원 7 저장 → 저장됨, 대기방 "7/7"', async ({ user, bots }) => {
    const page = user.page;
    await hostRoomWithBots(user, bots, 6);
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 7 });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.maxPlayers).toBe(7);
    await expect(K.capacity(page)).toHaveText('7/7');
});

test('A01-E-055 정원 5 방 5명 → 정원 6 저장 → 대기방 "5/6"(빈 자리 1)', async ({ user, bots }) => {
    const page = user.page;
    await hostRoomWithBots(user, bots, 4, { maxPlayers: 5 });
    await expect(K.capacity(page)).toHaveText('5/5');
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 6 });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.maxPlayers).toBe(6);
    await expect(K.capacity(page)).toHaveText('5/6');
});

test('A01-E-056 자동 → 직접 지정 광대1·의사1 저장 → 서버 구성 custom·역할 수', async ({ user }) => {
    const page = user.page;
    await K.createRoomOn(user);
    await K.openEditor(page);
    await K.fill(page, { custom: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.roleCompositionMode).toBe('custom');
    const s = (await e2e.roomOf(K.U(user))).settings;
    expect(s.roleCounts).toMatchObject({ JOKER: 1, DOCTOR: 1 });
    expect((s.roleCounts.GUARD ?? 0) + (s.roleCounts.WITCH_HUNTER ?? 0)).toBe(0);
});

// A01-E-057~062: 창 칸 끝값 (칸마다 하나)
for (const [i, key] of [[57, 'MAX'], [58, 'JOKER'], [59, 'TALK'], [60, 'VOTE'], [61, 'TRIAL'], [62, 'NIGHT']]) {
    const edge = K.EDGES[key];
    test(`A01-E-0${i} 설정 바꾸기 창 ${edge.label} 끝값 ${edge.min}/${edge.max}에서 단추 꺼짐`, async ({ user }) => {
        await K.createRoomOn(user);
        await K.openEditor(user.page);
        await K.expectEdges(user.page, edge);
    });
}

test('A01-E-063 정원 바꾸고 취소 → 서버 정원·봇 준비 그대로', async ({ user, bots }) => {
    const page = user.page;
    const { room } = await hostRoomWithBots(user, bots, 2);
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 8 });
    await page.getByRole('button', { name: '설정 변경 취소' }).click();
    await expect(editor(page)).toHaveCount(0);
    const after = await e2e.roomOf(K.U(user));
    expect(after.settings.maxPlayers).toBe(10);
    expect(after.settingsVersion).toBe(room.settingsVersion);
    expect(readyCount(after)).toBe(2);
});

test('A01-E-064 "설정 저장" 누른 직후 그 단추 꺼짐', async ({ user }) => {
    const page = user.page;
    await K.createRoomOn(user);
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 9 });
    const save = page.getByRole('button', { name: '설정 저장', exact: true });
    // 답이 빨리 와 창이 바로 닫혀도 놓치지 않게, 누르기 전에 단추가 꺼지는 순간을 적어 둠
    await save.evaluate((el) => {
        window.__a01SaveDisabled = el.disabled;
        new MutationObserver(() => { if (el.disabled) window.__a01SaveDisabled = true; }).observe(el, { attributes: true });
    });
    expect(await page.evaluate(() => window.__a01SaveDisabled)).toBe(false);
    await save.click();
    await expect.poll(() => page.evaluate(() => window.__a01SaveDisabled)).toBe(true);
});

test('A01-E-065 봇 방장 정원 10→6 → 사람 손님 대기방 "2/6"', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestInBotRoom(user, bots);
    await expect(K.capacity(page)).toHaveText('2/10');
    expect((await botUpdateSettings(host, { maxPlayers: 6 }))?.ok).toBe(true);
    await expect(K.capacity(page)).toHaveText('2/6');
});

test('A01-E-066 키보드만: 창에서 Tab으로 정원 − → Enter → Tab으로 "설정 저장" → Enter → 서버 정원 9', async ({ user }) => {
    const page = user.page;
    await K.createRoomOn(user);
    await K.openEditor(page);
    await K.tabTo(page, `${K.L.MAX} 감소`);
    await page.keyboard.press('Enter');
    await expect.poll(() => K.numberOf(page, K.L.MAX)).toBe(9);
    await K.tabTo(page, '설정 저장');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.maxPlayers).toBe(9);
});
