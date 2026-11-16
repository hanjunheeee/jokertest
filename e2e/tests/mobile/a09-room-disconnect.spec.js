'use strict';

// 모바일 대기방 끊김 15초 브라우저 시험 — 끊긴 봇은 15초 동안 명단에 남았다가 빠짐
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-084 (모바일 줄) — 15초는 진짜로 기다림 (@realtime), 대기방은 이름 없이 인원 수("파티 인원 N명")로 명단을 봄
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../ingame/_a09-simple-kit');

// 대기방 다시 붙기 기다림 (서버 ROOM_RECONNECT_GRACE_MS)
const ROOM_GRACE_MS = 15_000;
const party = (page, n) => page.locator(`[aria-label="파티 인원 ${n}명"]`);

// 서버 대기방 명단에 그 사람이 있는지
async function inRoom(hostUuid, uuid) {
    const room = await e2e.roomOf(hostUuid);
    return Boolean(room?.players.some((p) => p.uuid === uuid));
}

test('A09-E-084 모바일 6명 방, 봇이 끊긴 지 16초 → 명단에서 빠짐 @realtime @smoke', async ({ user, bots }) => {
    const page = user.page;
    // 봇 방장 방(정원 6)에 봇 5 + 나
    const [host, ...guests] = await bots.spawn(5);
    const room = await host.createRoom({ maxPlayers: 6 });
    for (const bot of guests) await bot.joinByCode(room.roomCode);
    await ui.joinRoomByCodeUi(page, room.roomCode);
    await expect(party(page, 6)).toBeVisible();

    const gone = guests[0];
    const droppedAt = Date.now();
    K.dropBot(gone);
    // 15초 전엔 남아 있고, 15초(+1.5초) 뒤엔 빠져 있음
    await K.sleepUntil(droppedAt + ROOM_GRACE_MS - 1000);
    expect(await inRoom(host.uuid, gone.uuid), '14초엔 서버 명단에 있음').toBe(true);
    await expect(party(page, 6)).toBeVisible();
    await K.sleepUntil(droppedAt + ROOM_GRACE_MS + K.SLACK_MS);
    expect(await inRoom(host.uuid, gone.uuid), '16.5초엔 서버 명단에 없음').toBe(false);
    await expect(party(page, 5)).toBeVisible({ timeout: 2000 });
    await expectReadable(page.getByText('파티 인원 5명'));
});
