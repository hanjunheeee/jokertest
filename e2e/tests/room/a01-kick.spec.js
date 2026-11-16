'use strict';

// 대기방 추방 브라우저 시험 (PC, 간단) — 받은 버그 7: 한 번 누르면 바로 내보냄·창 글과 실패 글이 보임·쫓겨난 사람 화면·3번 규칙
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-581~611 (사람 1 + 봇, 판 안 씀)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('./_a01b-kick-kit');

const { U, TEXT, hostRoom, guestRoom, kickAfterLeave, kickWithoutAnswer } = K;

test('A01-E-581 [버그 7] 한 번 눌러 바로 내보냄 — 창 닫힘·자리 빠짐·인원 4·확인 칸 안 뜸 (정원 6 · 사람 방장 + 봇 4) @smoke', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const target = list[0];
    // 확인 칸이 브라우저 확인 창으로 떠도 잡히게 모아 둠
    const asked = [];
    page.on('dialog', (dialog) => { asked.push(dialog.message()); dialog.dismiss().catch(() => {}); });

    await K.openKick(page);
    await K.kickRowButton(page, target).click();

    await expect(K.kickDialog(page)).toHaveCount(0);
    await K.expectParty(page, 4);
    expect(await K.seatsOf(U(user)), '서버 명단에서 빠짐').not.toContain(U(target));
    expect(asked, '확인 창 안 뜸').toEqual([]);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

// 정원마다 꽉 찬 방 (값 6개 = 번호 6개)
[5, 6, 7, 8, 9, 10].forEach((max, i) => {
    test(`A01-E-${582 + i} [버그 7] 정원 ${max} 꽉 찬 방 → 봇 하나 "추방" 한 번 → 창 닫힘·인원 ${max - 1} (사람 방장 + 봇 ${max - 1})`, async ({ user, bots }) => {
        const page = user.page;
        const { list } = await hostRoom(user, bots, { maxPlayers: max, botCount: max - 1 });
        await expect(K.capacity(page)).toHaveText(`${max}/${max}`);

        await K.openKick(page);
        await K.kickRowButton(page, list.at(-1)).click();

        await expect(K.kickDialog(page)).toHaveCount(0);
        await K.expectParty(page, max - 1);
        await expect(K.capacity(page)).toHaveText(`${max - 1}/${max}`);
        expect(await K.seatsOf(U(user))).toHaveLength(max - 1);
    });
});

test('A01-E-588 [버그 7] 창 안 제목·안내 글·줄 "추방" 단추가 사람 눈에 읽힘 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    await K.openKick(page);
    const dialog = K.kickDialog(page);

    // 제목은 틀 그림 위 글(누르기 막힘)이라 가려짐은 안 보고 대비만
    await expectReadable(dialog.getByRole('heading', { name: TEXT.kickTitle }), { uncovered: false });
    await expectReadable(dialog.getByText(TEXT.kickNotice, { exact: true }));
    // 줄마다 "추방" 단추 (봇 4명 = 4개)
    const rows = dialog.getByRole('button', { name: '추방', exact: true });
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await K.expectLabelButtonReadable(rows.nth(i), '추방');
});

test('A01-E-589 [버그 7] 대상이 먼저 나가면 실패 글 "이미 방에서 나간 참가자입니다."가 보임 — 대비 4.5 이상 (정원 6 · 봇 4)', async ({ user, bots }) => {
    const { error } = await kickAfterLeave(user, bots);
    // 옛 버그: 검정 바탕에 검정 글자 → 대비까지 봄
    const r = await expectReadable(error);
    expect(r.ratio, '글자·바탕 대비').toBeGreaterThanOrEqual(4.5);
    await expect(K.kickDialog(user.page), '실패면 창 그대로').toBeVisible();
});

test('A01-E-590 실패 글이 있는 채 다른 봇 "추방" → 창 닫힘·그 봇 빠짐 (정원 6 · 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    const { gate, list } = await kickAfterLeave(user, bots);
    const next = list[1];
    // 이번엔 나감 알림을 그대로 받음
    gate.drop.clear();

    await K.kickRowButton(page, next).click();

    await expect(K.kickDialog(page)).toHaveCount(0);
    expect(await K.seatsOf(U(user)), '서버 명단에서 빠짐').not.toContain(U(next));
    // 화면 인원도 그 봇만큼 줄어듦 (먼저 나간 봇 알림은 버렸으니 5 → 4 이하)
    await expect.poll(() => K.partyNumber(page)).toBeLessThanOrEqual(4);
});

test('A01-E-591 [버그 7] 혼자 있는 방에서 창을 열면 "추방할 수 있는 참가자가 없습니다."가 보임 (정원 5 · 사람 방장만)', async ({ user, bots }) => {
    const page = user.page;
    await hostRoom(user, bots, { maxPlayers: 5, botCount: 0 });
    await K.openKick(page);
    const empty = K.kickDialog(page).getByTestId('kick-empty-targets');
    await expect(empty).toHaveText(TEXT.emptyTargets);
    await expectReadable(empty);
});

test('A01-E-592 [버그 7] 방 확인이 풀리면 "참가자 추방" 꺼짐 + 꺼진 까닭 글이 마우스 안 올려도 보임 (정원 6 · 사람 방장)', async ({ user, bots }) => {
    const page = user.page;
    const gate = await K.socketGate(page);
    await hostRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await expect(K.kickButton(page)).toBeEnabled({ timeout: 20_000 });

    // 오프라인 대신 화면 소켓을 끊음 (열린 웹소켓은 오프라인 흉내로 안 끊김)
    await gate.cut();

    await expect(K.kickButton(page)).toBeDisabled();
    await expect(K.lockedReason(page)).toHaveText(TEXT.lockedReasonEnd);
    await expectReadable(K.lockedReason(page));
});

test('A01-E-593 다시 붙으면 까닭 글 사라지고 "참가자 추방" 켜짐 (정원 6 · 사람 방장)', async ({ user, bots }) => {
    const page = user.page;
    const gate = await K.socketGate(page);
    await hostRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await expect(K.kickButton(page)).toBeEnabled({ timeout: 20_000 });
    await gate.cut();
    await expect(K.lockedReason(page)).toBeVisible();

    // 15초(끊김 자리 남김) 안에 다시 붙음
    await gate.restore();

    await expect(K.kickButton(page)).toBeEnabled({ timeout: 20_000 });
    await expect(K.lockedReason(page)).toHaveCount(0);
});

test('A01-E-594 쫓겨난 봇은 다시 코드로 들어옴 → 방장 화면에 그 자리 다시 "대기중" (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    const { room, list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const target = list[0];
    // 봇은 모두 준비 → "대기중"은 방장 자리 하나뿐
    await K.readyBots(list, U(user));
    await expect(K.waitingBadges(page)).toHaveCount(1);

    await K.kickUi(page, target);
    await K.expectParty(page, 4);
    await target.joinByCode(room.roomCode);

    await K.expectParty(page, 5);
    // 다시 들어온 봇은 준비 안 됨으로 앉음 → "대기중" 둘 (방장 + 그 봇)
    await expect(K.waitingBadges(page)).toHaveCount(2);
    const seat = (await e2e.roomOf(U(user))).players.find((p) => p.uuid === U(target));
    expect(seat?.isReady, '다시 들어온 봇 준비 안 됨').toBe(false);
});

test('A01-E-595 같은 봇 2번째 추방 뒤에도 다시 들어옴 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    const { room, list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const target = list[0];

    await K.kickUi(page, target);
    await target.joinByCode(room.roomCode);
    await K.expectParty(page, 5);
    await K.kickUi(page, target);
    await K.expectParty(page, 4);
    await target.joinByCode(room.roomCode);

    await K.expectParty(page, 5);
    expect(await K.seatsOf(U(user)), '서버 명단에 다시 있음').toContain(U(target));
});

test('A01-E-596 3번째 추방 뒤 봇은 못 들어옴 — 봇은 KICKED_TOO_MANY_TIMES, 방장 화면 인원 그대로 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    const { room, list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const target = list[0];
    for (let i = 0; i < 2; i += 1) {
        await K.kickUi(page, target);
        await target.joinByCode(room.roomCode);
        await K.expectParty(page, 5);
    }
    await K.kickUi(page, target);
    await K.expectParty(page, 4);

    const rejected = await K.botJoinRejected(target, room.roomCode);

    expect(rejected).toContain('KICKED_TOO_MANY_TIMES');
    await K.expectParty(page, 4);
    expect(await K.seatsOf(U(user))).not.toContain(U(target));
});

test('A01-E-597 봇 방장이 사람을 추방하면 사람 화면은 방 목록(/multiplay)으로 (정원 6 · 봇 방장 + 봇 3)', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 3 });

    await K.botKick(host, U(user));

    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    expect(await e2e.roomOf(U(user)), '서버 방 자리 없음').toBeNull();
});

test('A01-E-598 쫓겨난 사람 1번째 뒤엔 코드로 다시 들어감 (정원 6 · 봇 방장)', async ({ user, bots }) => {
    const page = user.page;
    const { host, room } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await K.botKick(host, U(user));
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });

    await ui.joinRoomByCodeUi(page, room.roomCode);

    await K.expectParty(page, 2);
    expect((await e2e.roomOf(U(user)))?.roomId, '같은 방').toBe(room.roomId);
});

test('A01-E-599 쫓겨난 뒤 다른 방은 바로 들어감 (정원 6 봇 방 둘)', async ({ user, bots }) => {
    const page = user.page;
    const a = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    const b = await K.botRoom(bots, { maxPlayers: 6 });
    await K.botKick(a.host, U(user));
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });

    await ui.joinRoomByCodeUi(page, b.room.roomCode);

    await K.expectParty(page, 2);
    expect((await e2e.roomOf(U(user)))?.roomId, 'B방').toBe(b.room.roomId);
});

test('A01-E-600 "추방" 누른 순간 그 줄 "보내는 중", 다른 줄 단추 꺼짐 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    const gate = await K.socketGate(page);
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const [target, ...others] = list;
    await K.openKick(page);
    // 서버 답을 잠깐 붙잡아 "보내는 중"을 볼 틈을 만듦 (8초 안에 풂)
    gate.hold();

    await K.kickRowButton(page, target).click();

    await expect(K.kickRowButton(page, target)).toHaveAccessibleName('추방 보내는 중');
    await expect(K.kickRowButton(page, target)).toHaveText('보내는 중');
    for (const other of others) await expect(K.kickRowButton(page, other)).toBeDisabled();

    gate.release();
    await expect(K.kickDialog(page)).toHaveCount(0);
    await K.expectParty(page, 4);
});

test('A01-E-601 같은 줄 "추방"을 두 번 빠르게 눌러도 한 명만 빠짐·오류 글 없음 (정원 7 · 사람 방장 + 봇 5)', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 7, botCount: 5 });
    const [target, ...others] = list;
    await K.openKick(page);

    await K.kickRowButton(page, target).dblclick();

    await expect(K.kickDialog(page)).toHaveCount(0);
    await K.expectParty(page, 5);
    await expect(page.getByTestId('kick-error')).toHaveCount(0);
    const seats = await K.seatsOf(U(user));
    expect(seats).not.toContain(U(target));
    for (const other of others) expect(seats, '다른 봇은 그대로').toContain(U(other));
});

test('A01-E-602 연달아 두 명 — 추방 → 창 닫힘 → 다시 열어 다른 봇 추방 → 인원 8 (정원 10 · 사람 방장 + 봇 9)', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 10, botCount: 9 });

    await K.kickUi(page, list[0]);
    await K.expectParty(page, 9);
    await K.kickUi(page, list[1]);

    await K.expectParty(page, 8);
    expect(await K.seatsOf(U(user))).toHaveLength(8);
});

test('A01-E-603 추방 줄을 키보드로 — Tab으로 "추방"에 가서 Enter → 빠짐·창 닫힘 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const target = list[2];
    await K.openKick(page);
    const button = K.kickRowButton(page, target);

    // 창 안에서 Tab을 눌러 그 줄 단추에 닿을 때까지 (창 안 단추 수보다 넉넉히)
    let reached = false;
    for (let i = 0; i < 20 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await button.evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'Tab으로 그 줄 "추방"에 닿음').toBe(true);
    await page.keyboard.press('Enter');

    await expect(K.kickDialog(page)).toHaveCount(0);
    await K.expectParty(page, 4);
    expect(await K.seatsOf(U(user))).not.toContain(U(target));
});

test('A01-E-604 창 닫기 단추 → 창 사라짐·아무도 안 빠짐 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    await K.openKick(page);

    await K.kickClose(page).click();

    await expect(K.kickDialog(page)).toHaveCount(0);
    await K.expectParty(page, 5);
    expect(await K.seatsOf(U(user))).toHaveLength(5);
});

test('A01-E-605 창이 떠 있는 동안 방장 단추 줄 숨김, 닫으면 다시 보임 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    await K.openKick(page);

    await expect(K.kickButton(page)).toHaveCount(0);
    await expect(K.hostButton(page, '방 설정 변경')).toHaveCount(0);

    await K.kickClose(page).click();
    await expect(K.kickButton(page)).toBeVisible();
    await expect(K.hostButton(page, '방 설정 변경')).toBeVisible();
});

test('A01-E-606 손님 화면엔 "참가자 추방" 단추 0개 (정원 6 · 봇 방장 + 봇 2)', async ({ user, bots }) => {
    const page = user.page;
    await guestRoom(user, bots, { maxPlayers: 6, botCount: 2 });
    // 방 확인이 끝나 준비 단추가 켜진 뒤에 봄 (확인 전이라 안 보인 것과 헷갈리지 않게)
    await expect(page.getByRole('button', { name: '준비완료', exact: true })).toBeEnabled({ timeout: 20_000 });

    await expect(K.kickButton(page)).toHaveCount(0);
});

test('A01-E-607 추방 뒤 공개 목록 인원 −1 — 다른 봇이 공개 목록을 물으면 그 방 5명 (정원 8 · 사람 방장 + 봇 5, 공개)', async ({ user, bots }) => {
    const page = user.page;
    const { room, list } = await hostRoom(user, bots, { maxPlayers: 8, botCount: 5, open: true });
    const [outsider] = await bots.spawn(1);

    await K.kickUi(page, list[0]);

    await expect.poll(async () => {
        const reply = await outsider.request('get_public_rooms', {});
        return reply?.rooms?.find((r) => r.id === room.roomId)?.current ?? null;
    }, { message: '공개 목록 인원' }).toBe(5);
});

test('A01-E-608 넘겨받은 방장도 추방 됨 — 봇 방장 나감 → 사람이 방장 → 봇 추방 한 번 (정원 6 · 봇 방장 + 사람 + 봇 3)', async ({ user, bots }) => {
    const page = user.page;
    // 사람이 두 번째로 들어가야 방장을 넘겨받음 → 봇 3은 사람 뒤에
    const { host, room } = await K.botRoom(bots, { maxPlayers: 6 });
    await ui.joinRoomByCodeUi(page, room.roomCode);
    const list = await K.joinBots(bots, 3, room.roomCode);
    await K.expectParty(page, 5);

    await K.botLeave(host);
    await K.expectParty(page, 4);
    await expect(K.kickButton(page)).toBeEnabled({ timeout: 20_000 });
    await K.kickUi(page, list[0]);

    await K.expectParty(page, 3);
    expect(await K.seatsOf(U(user))).not.toContain(U(list[0]));
});

test('A01-E-609 "추방" 직후 답이 안 오면 8초 뒤 결과 모름 글·"결과 확인" 단추가 보임 (정원 6 · 사람 방장 + 봇 4) @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { unknown, pressedAt } = await kickWithoutAnswer(user, bots);

    // 바로가 아니라 8초 기다린 뒤에 뜸 (반올림 틈 1.5초)
    expect(Date.now() - pressedAt, '8초 뒤에 뜸').toBeGreaterThanOrEqual(K.KICK_ACK_MS - 1_500);
    await expectReadable(unknown);
    await expectReadable(K.kickDialog(page).getByRole('button', { name: '결과 확인', exact: true }));
});

test('A01-E-610 "결과 확인" 누르면 결과 반영 — 서버가 추방을 받았으면 창 닫힘·자리 빠짐 (정원 6 · 사람 방장 + 봇 4) @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { gate, target } = await kickWithoutAnswer(user, bots);
    // 붙잡은 값을 다 넘기고 다시 받게 함 (요청 자체는 서버에 갔음 → 서버는 추방함)
    gate.release();

    await K.kickDialog(page).getByRole('button', { name: '결과 확인', exact: true }).click();

    await expect(K.kickDialog(page)).toHaveCount(0);
    await K.expectParty(page, 4);
    expect(await K.seatsOf(U(user))).not.toContain(U(target));
});

test('A01-E-611 쫓겨난 사람 화면이 안 갇힘 — 방 목록에서 "방 만들기" → 설정 화면 (정원 6 · 봇 방장)', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await K.botKick(host, U(user));
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });

    await page.getByRole('button', { name: '방 만들기', exact: true }).click();

    await expect(page).toHaveURL(/\/game-setup/);
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();
});
