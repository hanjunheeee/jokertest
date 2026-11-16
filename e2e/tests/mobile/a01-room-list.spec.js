'use strict';

// 모바일 공개 방 목록 카드 브라우저 시험 — 봇 코드 방 카드엔 "코드" 배지, 가득 찬 방 카드엔 "마감" 배지·누를 수 없음
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-130, 돌리지 않고 모임만: npx playwright test --list tests/mobile/a01-room-list.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { openRoomList, findRoomRow } = require('../room/roomHelpers');

test('A01-E-130 모바일 목록: 봇 코드 방 → "코드" 배지 / 가득 찬 방 → "마감" 배지·카드 꺼짐 @smoke', async ({ user, bots }) => {
    const [codeHost, fullHost, ...fillers] = await bots.spawn(6);
    await codeHost.createRoom({ accessType: 'code', maxPlayers: 10 });
    const full = await fullHost.createRoom({ accessType: 'open', maxPlayers: 5 });
    for (const b of fillers) await b.joinByCode(full.roomCode);
    await openRoomList(user.page);

    const codeCard = await findRoomRow(user.page, `${codeHost.nickname}의 방`, { timeoutMs: 15_000 });
    expect(codeCard, '코드 방 카드').not.toBeNull();
    await expectReadable(codeCard.getByText('코드', { exact: true }));
    await expect(codeCard).toBeEnabled();

    const fullCard = await findRoomRow(user.page, `${fullHost.nickname}의 방`, { timeoutMs: 15_000 });
    expect(fullCard, '가득 찬 방 카드').not.toBeNull();
    await expect(fullCard).toContainText('5/5');
    await expect(fullCard.getByText('마감', { exact: true })).toBeVisible();
    await expect(fullCard).toBeDisabled();
});
