'use strict';

// 모바일 판이 시작하자마자 끝나는 브라우저 시험 — 방장이 "게임시작"을 누른 바로 그때 하나뿐인 광대 봇이 판에서 나가 판이 끝남
// 대기방이 방 목록(/multiplay)으로 안 튕기고 판 화면을 거쳐 결과 화면으로 감 (frontend-mobile matching/pages/GameMatchingPage.jsx hasCurrentInGame, 커밋 d71ab651 "판이 바로 끝나도 목록으로 안 감")
// 목록 A07-승패-결과-골드.md 번호 A07-E-141 (사람 방장 1 + 봇 4), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a07-quick-end.spec.js
const { test, expect, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const K = require('../room/_a01a-kit');

const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

test('A07-E-141 모바일 5명 방 "게임시작" 바로 뒤 하나뿐인 광대 봇이 나가 판이 끝남 → 방 목록으로 안 튕기고 결과 화면 "시민 진영 승리" @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const botList = await bots.spawn(4);
    const room = await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    const presets = K.autoRoles([user], botList);
    await e2e.setRoles(presets, { roomId: room.roomId });
    const joker = botList.find((b) => presets[K.U(b)] === 'JOKER');

    // 화면이 지나간 주소 모두 (방 목록에 한 번이라도 갔는지)
    const urls = [];
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) urls.push(frame.url()); });

    // 광대 봇은 판 시작 알림을 받자마자 나감 → 사람 화면이 판 화면에 닿기 전후로 판이 끝남
    let gameId = null;
    const left = joker.waitForEvent('game_started', { timeoutMs: 30_000 })
        .then((p) => { gameId = p.gameId; return joker.request('leave_game_session', { gameId: p.gameId }); });
    await page.getByRole('button', { name: '게임시작' }).click();
    const reply = await left;
    expect(reply?.ok, `광대 봇 나가기 거절: ${reply?.code}`).toBe(true);

    await expect.poll(async () => (await e2e.game(gameId))?.phase, { message: '판 끝' }).toBe('ENDED');
    const ended = await e2e.game(gameId);
    expect(ended?.players?.find((p) => p.uuid === K.U(joker))?.role, '미리 정한 광대').toBe('JOKER');
    expect(ended?.winResult?.winner, '서버 승자').toBe('CITIZEN');

    // 결과 연출 영상이 끝나 결과판이 뜰 때까지 → 판 끝 광고 창 닫기
    await expect(page).toHaveURL(/\/gameresult/, { timeout: 40_000 });
    await expect(resultBoard(page)).toBeVisible({ timeout: 60_000 });
    await ui.closeResultAd(page);
    await expectReadable(resultBoard(page).getByText('시민 진영 승리', { exact: true }));
    expect(urls.filter((u) => /\/multiplay/.test(u)), '방 목록으로 튕김').toEqual([]);
});
