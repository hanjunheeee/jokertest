'use strict';

// 대기방 방장 넘김·방 삭제 브라우저 시험 (모바일, 간단) — 봇 방장이 나가면 폰 화면에 방장 단추, 폰 방장이 방 삭제하면 방 목록으로
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-639~640 (사람 1 + 봇, 판 안 씀)
const { test, expect, e2e } = require('../../helpers/fixtures');
const K = require('../room/_a01b-kick-kit');

const { U, TEXT, HOST_BUTTONS, hostRoom, guestRoom } = K;

test('A01-E-639 모바일 방장 넘김 — 봇 방장 나감 → 폰 화면에 방장 단추 (정원 6 · 봇 방장 → 사람) @smoke @safari', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await expect(K.hostButton(page, '게임시작')).toHaveCount(0);

    await K.botLeave(host);

    for (const name of HOST_BUTTONS) await expect(K.hostButton(page, name), `${name} 단추`).toBeVisible();
    await K.expectParty(page, 1);
    expect((await e2e.roomOf(U(user)))?.hostUuid, '서버 방장').toBe(U(user));
});

test('A01-E-640 모바일 방 삭제 확인 → 방 목록 (정원 6 · 사람 방장 + 봇 2)', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 2 });
    const asked = K.answerNextConfirm(page, true);

    await K.hostButton(page, '방 삭제하기').click();

    expect(await asked).toBe(TEXT.deleteConfirm);
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    await expect.poll(async () => e2e.roomOf(U(user))).toBeNull();
    expect(await e2e.roomOf(U(list[0])), '봇도 방 없음').toBeNull();
});
