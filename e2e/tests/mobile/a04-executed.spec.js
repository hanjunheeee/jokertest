'use strict';

// 모바일 내가 처형된 뒤 시험: 추방 연출 뒤 사망 후 선택 창(관전 계속하기·게임 나가기), 나가면 바로 다른 방 만들기 됨
// 목록 A04-E-063·066 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 내가 피고, 봇 하나가 유죄 → 처형 (시민 하나가 죽어도 판은 이어짐)
async function getExecuted(table, user, bots) {
    const { t } = await A.startTrial(table, { humans: [user], bots, pick: () => user });
    await A.botsTribunal(t, [[t.bots[1], 'GUILTY']]);
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, user.account.uuid).alive).toBe(false);
    await expect(trial.expulsion(user.page)).toBeVisible({ timeout: 15000 });
    return t;
}

test('A04-E-063 내가 처형되면 추방 연출 뒤 사망 후 선택 창에 "관전 계속하기"·"게임 나가기"가 읽힘 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    await getExecuted(table, user, 5);
    const dialog = trial.deadChoice(page);
    await A.calm(page, () => expect(dialog).toBeVisible({ timeout: 1000 }), { keepWatching: false, timeout: 45000 });
    await A.readable(dialog.getByRole('button', { name: '관전 계속하기' }));
    await A.readable(dialog.getByRole('button', { name: '게임 나가기' }));
});

test('A04-E-066 처형된 뒤 판에서 나가면 바로 로비에서 새 방을 만들 수 있음 (모바일 7명) @game', async ({ user, table }) => {
    await getExecuted(table, user, 6);
    await A.leaveFromDeadChoice(user.page);
    const room = await A.createRoomFromLobby(user);
    expect(room.hostUuid).toBe(user.account.uuid);
});
