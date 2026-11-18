'use strict';

// PC 방 만들기 브라우저 시험 — 정원 5~10 × 코드로만 참가, 칸 끝값 단추, 지운 3칸 없음, 재판이 투표 따라감, 방 이름·방장 준비 안 됨·연타·처음 값·코드 글자·복사·키보드
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-001~019·025~032, 돌리지 않고 모임만: npx playwright test --list tests/room/a01-create.spec.js
const { test, expect, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { readySilhouettes } = require('./roomHelpers');
const K = require('./_a01a-kit');

const pad = (n) => String(n).padStart(3, '0');
const notReadySeats = (page) => page.getByRole('img', { name: '준비 전 참가자' });

// A01-E-001~012: 정원 5~10 × 코드로만 참가 끔/켬 (값 하나 = 시험 하나)
// "자리 칸 = 정원"은 결정 2026-11-16 오전 둘째 2번(칸은 앉은 수만큼, 대신 "앉은 수/정원" 숫자)대로 "1/정원" 숫자로 봄
{
    let no = 1;
    for (const max of [5, 6, 7, 8, 9, 10]) {
        for (const code of [false, true]) {
            const id = `A01-E-${pad(no)}`;
            const smoke = no === 1 ? ' @smoke' : '';
            test(`${id} 정원 ${max}·코드로만 참가 ${code ? '켬' : '끔'} → 대기방 "1/${max}", 코드 6자리 보임, 서버 정원·공개 방식 맞음${smoke}`, async ({ user }) => {
                const page = user.page;
                const room = await K.createRoomOn(user, { maxPlayers: max, code });
                await expect(K.capacity(page)).toHaveText(`1/${max}`);
                await expectReadable(K.capacity(page));
                const shown = await K.openShownCode(page);
                expect(shown.code).toMatch(/^[A-Z0-9]{6}$/);
                expect(shown.code, '화면 코드 = 서버 코드').toBe(room.roomCode);
                await expectReadable(shown.cell);
                await shown.close();
                expect(room.settings.maxPlayers).toBe(max);
                expect((await K.liveRoom(room.roomId))?.accessType).toBe(code ? 'code' : 'open');
            });
            no += 1;
        }
    }
}

test('A01-E-013 정원 칸: 10에서 + 꺼짐, 5까지 내리면 − 꺼짐', async ({ user }) => {
    await K.openSetupPage(user.page);
    await expect(K.arrow(user.page, K.L.MAX, '증가')).toBeDisabled();
    await K.expectEdges(user.page, K.EDGES.MAX);
});

test('A01-E-014 만들기 화면 두 탭 어디에도 "불이 꺼진 무도회"·"영혼의 베팅"·"투표 공개" 없음', async ({ user }) => {
    await K.openSetupPage(user.page);
    await K.expectNoRemovedFields(user.page);
});

// A01-E-015~018: 시간 칸 끝값 (칸마다 하나)
for (const [i, key, range] of [[15, 'TALK', '30/150'], [16, 'VOTE', '30/90'], [17, 'TRIAL', '15/120'], [18, 'NIGHT', '30/120']]) {
    const edge = K.EDGES[key];
    test(`A01-E-${pad(i)} ${edge.label} 끝값 ${range}에서 단추 꺼짐`, async ({ user }) => {
        await K.openSetupPage(user.page);
        await K.expectEdges(user.page, edge);
    });
}

test('A01-E-019 투표 90으로 → 재판 칸 90, 만든 방 설정에 재판 시간 칸 없음', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.fill(page, { vote: 90 });
    expect(await K.numberOf(page, K.L.TRIAL)).toBe(90);
    await page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(page).toHaveURL(/\/game-matching/);
    const room = await K.waitRoom(K.U(user));
    expect(room.settings.dayVoteTime).toBe(90);
    expect(room.settings).not.toHaveProperty('tribunalTime');
});

test('A01-E-025 대기방 머리에 "닉네임의 방"이 읽힘', async ({ user }) => {
    await K.createRoomOn(user);
    await expect(K.roomTitle(user.page)).toHaveText(K.titleOf(user));
    await expectReadable(K.roomTitle(user.page));
});

test('A01-E-026 만든 직후 방장 칸은 준비 표시 없음("대기중"), 단추는 "준비완료"', async ({ user }) => {
    const page = user.page;
    const room = await K.createRoomOn(user);
    await expect(readySilhouettes(page)).toHaveCount(0);
    await expect(notReadySeats(page)).toHaveCount(1);
    // 자리 글은 누르기를 안 받는 글(pointer-events:none)이라 가운데 점 검사가 늘 아래 그림을 집음 → 가려짐 검사만 뺌
    await expectReadable(page.getByText('대기중', { exact: true }), { uncovered: false });
    await expectReadable(page.getByRole('button', { name: '준비완료' }));
    expect(room.players.find((p) => p.uuid === K.U(user))?.isReady).toBe(false);
});

test('A01-E-027 "게임 만들기" 빠르게 세 번 → 이 사람 방은 1개', async ({ user, bots }) => {
    const page = user.page;
    const [probe] = await bots.spawn(1);
    await K.openSetupPage(page);
    // 화면이 "만드는 중"으로 바뀌기 전에 세 번
    await page.getByRole('button', { name: '게임 만들기' }).evaluate((el) => { el.click(); el.click(); el.click(); });
    await expect(page).toHaveURL(/\/game-matching/);
    await K.waitRoom(K.U(user));
    // 명단에 이 사람이 든 방(이름 "닉네임의 방")이 공개 목록에 1개
    await expect.poll(async () => (await K.listedTitled(probe, K.titleOf(user))).length).toBe(1);
});

test('A01-E-028 안 건드리고 만듦 → 정원 10·광대 1·토론 60·투표 60·밤 90·자동', async ({ user }) => {
    const room = await K.createRoomOn(user);
    expect(room.settings).toMatchObject({
        maxPlayers: 10, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90, roleCompositionMode: 'auto',
    });
});

test('A01-E-029 [지금 동작] 의사 밤 시간만 60 → 방 설정 직업별 밤 시간 { DOCTOR: 60 }', async ({ user }) => {
    const room = await K.createRoomOn(user, { roleNights: { DOCTOR: 60 } });
    expect(room.settings.roleNightActionTimes).toEqual({ DOCTOR: 60 });
});

test('A01-E-030 [지금 동작] 방 20번 만들고 나가기 → 코드 20개 어디에도 I·O·0·1 없음', async ({ user }) => {
    test.setTimeout(300_000);
    const codes = [];
    for (let i = 0; i < 20; i += 1) codes.push(await K.createAndDelete(user));
    expect(codes).toHaveLength(20);
    for (const code of codes) expect(code, `코드 ${code}`).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
});

test('A01-E-031 [지금 동작] "방코드 복사" → 클립보드 6자리 = 서버 코드', async ({ user }) => {
    const page = user.page;
    await user.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: E2E.desktopUrl });
    const room = await K.createRoomOn(user);
    await K.openShownCode(page);
    await page.getByRole('button', { name: '방코드 복사' }).click();
    await expect(page.getByRole('button', { name: '방코드 복사됨' })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(room.roomCode);
});

test('A01-E-032 키보드만: Tab으로 정원 − → Enter 두 번(정원 8) → Tab으로 "게임 만들기" → Enter → 대기방', async ({ user }) => {
    const page = user.page;
    await K.openSetupPage(page);
    await K.tabTo(page, `${K.L.MAX} 감소`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect.poll(() => K.numberOf(page, K.L.MAX)).toBe(8);
    await K.tabTo(page, '게임 만들기');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/game-matching/);
    const room = await K.waitRoom(K.U(user));
    expect(room.settings.maxPlayers).toBe(8);
    expect(await e2e.gameOf(K.U(user))).toBeNull();
});
