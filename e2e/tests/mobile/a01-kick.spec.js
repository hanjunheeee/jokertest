'use strict';

// 대기방 추방 브라우저 시험 (모바일, 간단) — 받은 버그 7: 폰에서도 한 번 누르면 바로 내보냄·시트 글과 실패 글·까닭 글이 보임·쫓겨난 사람 화면
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-612~625 (사람 1 + 봇, 판 안 씀)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../room/_a01b-kick-kit');

const { U, TEXT, hostRoom, guestRoom, kickAfterLeave, kickWithoutAnswer } = K;

test('A01-E-612 모바일 [버그 7] "추방" 한 번 → 시트 닫힘·자리 빠짐 (정원 6 · 사람 방장 + 봇 4) @smoke @safari', async ({ user, bots }) => {
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
    expect(await K.seatsOf(U(user))).not.toContain(U(target));
    expect(asked, '확인 창 안 뜸').toEqual([]);
});

// 정원마다 꽉 찬 방 (값 4개 = 번호 4개)
[5, 7, 8, 10].forEach((max, i) => {
    test(`A01-E-${613 + i} 모바일 정원 ${max} 꽉 찬 방 → 봇 하나 한 번에 빠짐·인원 ${max - 1} (사람 방장 + 봇 ${max - 1})`, async ({ user, bots }) => {
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

test('A01-E-617 모바일 [버그 7] 대상이 먼저 나가면 실패 글이 보임 (정원 6 · 사람 방장 + 봇 4) @safari', async ({ user, bots }) => {
    const { error } = await kickAfterLeave(user, bots);
    const r = await expectReadable(error);
    expect(r.ratio, '글자·바탕 대비').toBeGreaterThanOrEqual(4.5);
});

test('A01-E-618 모바일 [버그 7] 방 확인이 풀리면 꺼진 까닭 글이 보임 — 폰은 마우스 올림 없음 (정원 6 · 사람 방장) @safari', async ({ user, bots }) => {
    const page = user.page;
    const gate = await K.socketGate(page);
    await hostRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await expect(K.kickButton(page)).toBeEnabled({ timeout: 20_000 });

    // 확인 전 모습 = 화면 소켓 끊김 (오프라인 흉내는 열린 웹소켓을 못 끊음)
    await gate.cut();

    await expect(K.kickButton(page)).toBeDisabled();
    await expect(K.lockedReason(page)).toHaveText(TEXT.lockedReasonEnd);
    await expectReadable(K.lockedReason(page));
});

test('A01-E-619 모바일 혼자 있는 방 → "추방할 수 있는 참가자가 없습니다."가 보임 (정원 5 · 사람 방장만)', async ({ user, bots }) => {
    const page = user.page;
    await hostRoom(user, bots, { maxPlayers: 5, botCount: 0 });
    await K.openKick(page);
    const empty = K.kickDialog(page).getByTestId('kick-empty-targets');
    await expect(empty).toHaveText(TEXT.emptyTargets);
    await expectReadable(empty);
});

test('A01-E-620 모바일 시트 안 안내 글·"추방" 단추가 보임 (정원 7 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    await hostRoom(user, bots, { maxPlayers: 7, botCount: 4 });
    await K.openKick(page);
    const dialog = K.kickDialog(page);

    await expectReadable(dialog.getByText(TEXT.kickNotice, { exact: true }));
    const rows = dialog.getByRole('button', { name: '추방', exact: true });
    await expect(rows).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await K.expectLabelButtonReadable(rows.nth(i), '추방');
});

test('A01-E-621 모바일 봇 방장이 추방하면 방 목록(/multiplay)으로 (정원 6 · 봇 방장 + 봇 2)', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 2 });

    await K.botKick(host, U(user));

    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
});

test('A01-E-622 모바일 3번 추방된 뒤 코드 입장 → "이 방에서 3번 추방되어…" 글 (정원 6 · 봇 방장)', async ({ user, bots }) => {
    const page = user.page;
    const { host, room } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    for (let i = 0; i < 2; i += 1) {
        await K.botKick(host, U(user));
        await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
        await ui.joinRoomByCodeUi(page, room.roomCode);
        await K.expectParty(page, 2);
    }
    await K.botKick(host, U(user));
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });

    const message = await K.codeEntryAlert(page, room.roomCode);

    expect(message).toBe(TEXT.codeKicked);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-623 모바일 같은 줄 "추방"을 두 번 빠르게 → 한 명만 빠짐 (정원 6 · 사람 방장 + 봇 4)', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const [target, ...others] = list;
    await K.openKick(page);

    await K.kickRowButton(page, target).dblclick();

    await expect(K.kickDialog(page)).toHaveCount(0);
    await K.expectParty(page, 4);
    const seats = await K.seatsOf(U(user));
    expect(seats).not.toContain(U(target));
    for (const other of others) expect(seats, '다른 봇은 그대로').toContain(U(other));
});

test('A01-E-624 모바일 손님 화면엔 "참가자 추방" 0개 (정원 6 · 봇 방장 + 봇 2)', async ({ user, bots }) => {
    const page = user.page;
    await guestRoom(user, bots, { maxPlayers: 6, botCount: 2 });
    // 방 확인이 끝나 준비 단추가 켜진 뒤에 봄
    await expect(page.getByRole('button', { name: '준비완료', exact: true })).toBeEnabled({ timeout: 20_000 });

    await expect(K.kickButton(page)).toHaveCount(0);
});

test('A01-E-625 모바일 8초 답이 없으면 결과 모름 글이 보임 (정원 6 · 사람 방장 + 봇 4) @realtime', async ({ user, bots }) => {
    const { unknown, pressedAt } = await kickWithoutAnswer(user, bots);

    expect(Date.now() - pressedAt, '8초 뒤에 뜸').toBeGreaterThanOrEqual(K.KICK_ACK_MS - 1_500);
    await expectReadable(unknown);
});
