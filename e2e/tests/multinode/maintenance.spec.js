// 점검 큰 안내 (Node 둘, 서버 전체에 걸려 @serial): AD-160 Node마다 판 하나 → 시작 시각에 둘 다 끝남, 두 Node 사람 다 큰 안내
// Node마다 자기 시계로 자기 판을 끝내는지 봄 (판은 방장 봇 Node에서 돎)
const mn = require('./_mn');
const { ui } = require('../../helpers/fixtures');
const { setMaintenance, clearMaintenance, notice, noticeButton } = require('../maintenance/_maint');

const { test, expect, NODE_IDS } = mn;

// 그 Node 사람 + 같은 Node 봇 방장 판 → { person, gameId }
async function gameOn(onNode, bots, node) {
    const person = await onNode.person(node, { mobile: false })
    const [host] = await mn.botsOn(bots, 1, node)
    const room = await host.createRoom({})
    await ui.joinRoomByCodeUi(person.page, room.roomCode)
    await ui.readyUi(person.page)
    await host.setReady(room.roomId, room.settingsVersion)
    const { gameId } = await host.startGame(room.roomId, room.settingsVersion)
    await expect(person.page).toHaveURL(/\/ingame/, { timeout: 20000 })
    return { person, gameId }
}

test('AD-160 Node 둘 판 둘 → 시각에 둘 다 끝남, 두 Node 플레이어 다 큰 안내 @serial @game', async ({ onNode, bots, internal }) => {
    const games = []
    for (const node of NODE_IDS.slice(0, 2)) games.push(await gameOn(onNode, bots, node))
    expect(new Set(await Promise.all(games.map((g) => mn.gameNodeOf(g.person.account.uuid)))).size).toBe(2)
    try {
        await setMaintenance(internal, { enabled: true, startsInMs: 10000 })
        for (const { person } of games) {
            await expect(notice(person.page)).toContainText('점검 예정이에요', { timeout: 15000 })
        }
        for (const { person } of games) {
            await expect(notice(person.page)).toContainText('점검으로 판이 끝났어요', { timeout: 30000 })
            await noticeButton(person.page, '로비로 가기').click()
            await expect(person.page).toHaveURL(/\/lobby/)
        }
        for (const { gameId } of games) {
            await expect.poll(async () => (await mn.e2e.game(gameId))?.phase ?? 'GONE', { timeout: 10000 }).toMatch(/ENDED|GONE/)
        }
    } finally {
        await clearMaintenance(internal)
    }
})
