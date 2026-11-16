// 끊겨도 화면은 판을 안 지우는지 시험(화면 상태): 끊김엔 판 그대로·다시 붙으면 스냅샷 물음, 채팅 기록은 탭에 판·채널마다 최근 200개
// 목록 A09-끊김-나가기-탈주.md A09-F-160~165, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/reconnect-keep.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { saveChatHistory, loadChatHistory } = await import("../../src/domains/game/ingame/utils/ingameSessionMemory.js")

test.afterEach(() => K.reset())

test("A09-F-160 7명 판 낮 투표 중 소켓 끊김 → 판 스토어 그대로(판 id·명단)", async () => {
  const t = K.seat({ n: 7, me: 1, jokers: [0] })
  await K.renderSnapshotProbe()
  await K.dropConnection(t.fake)
  assert.equal(K.useInGameStore.getState().gameId, t.gameId)
  assert.equal(t.state().players.length, 7)
  assert.equal(t.state().phase, "DAY")
})

test("A09-F-161 6명 판 끊겼다 다시 붙음 → get_session_snapshot { gameId } 보냄", async () => {
  const t = K.seat({ n: 6, me: 2, jokers: [0] })
  await K.renderSnapshotProbe()
  const before = t.fake.sentOf("get_session_snapshot").length
  await K.dropConnection(t.fake)
  await K.restoreConnection(t.fake)
  await K.flush()
  const asked = t.fake.sentOf("get_session_snapshot").slice(before)
  assert.deepEqual(asked, [{ gameId: t.gameId }])
})

test("A09-F-162 8명 판 끊김·붙음 3번 → 스냅샷 3번 물음", async () => {
  const t = K.seat({ n: 8, me: 3, jokers: [0, 1] })
  await K.renderSnapshotProbe()
  const before = t.fake.sentOf("get_session_snapshot").length
  for (let i = 0; i < 3; i += 1) {
    await K.dropConnection(t.fake)
    await K.restoreConnection(t.fake)
    await K.flush()
  }
  assert.equal(t.fake.sentOf("get_session_snapshot").length - before, 3)
})

// 채팅 기록 저장 → 새로고침(다시 읽기) → 남은 개수 (값 3)
const CHAT_CASES = [
  ["A09-F-163", 199, 199],
  ["A09-F-164", 200, 200],
  ["A09-F-165", 201, 200],
]
for (const [id, saved, kept] of CHAT_CASES) {
  test(`${id} 낮 채널 채팅 ${saved}개 저장 뒤 새로고침 → ${kept}개 (가장 옛 것부터 버림)`, () => {
    const messages = Array.from({ length: saved }, (_, i) => ({
      id: `m${i + 1}`, senderUuid: "a09-p1", text: `말 ${i + 1}`, sentAt: 1_800_000_000_000 + i,
    }))
    saveChatHistory("game", "a09-chat-game", "a09-p0", { DAY: messages, DEAD: [] })
    const loaded = loadChatHistory("game", "a09-chat-game", "a09-p0")
    assert.equal(loaded.DAY.length, kept)
    assert.equal(loaded.DAY.at(-1).id, `m${saved}`, "가장 새 말이 남음")
    assert.equal(loaded.DAY[0].id, `m${saved - kept + 1}`, "가장 옛 말부터 버림")
  })
}
