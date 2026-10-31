import test from "node:test"
import assert from "node:assert/strict"
import {
  isValidInGameSession,
  shouldRedirectOutOfInGame,
} from "../../../../../src/domains/game/ingame/utils/selectInGameSessionGuard.js"

const EMPTY_AFTER_REFRESH = { gameId: null, gameState: null }
const VALID_SESSION = { gameId: "g1", gameState: { id: "g1", phase: "NIGHT", dayIndex: 0 } }

test("AC-05: 새로고침으로 store가 빈 채로도 스냅샷 동기화가 checking인 동안에는 리다이렉트하지 않는다", () => {
  assert.equal(
    shouldRedirectOutOfInGame({ snapshotSyncStatus: "checking", ...EMPTY_AFTER_REFRESH }),
    false,
  )
})

test("AC-05: checking은 세션이 유효하든 무효하든 언제나 판단을 미룬다", () => {
  assert.equal(
    shouldRedirectOutOfInGame({ snapshotSyncStatus: "checking", ...VALID_SESSION }),
    false,
  )
  assert.equal(
    shouldRedirectOutOfInGame({
      snapshotSyncStatus: "checking",
      gameId: "g1",
      gameState: { id: "g-other" },
    }),
    false,
  )
})

test("AC-05: 확인이 끝나 세션을 복원했으면(recovered) 유효한 세션은 그대로 머문다", () => {
  assert.equal(
    shouldRedirectOutOfInGame({ snapshotSyncStatus: "recovered", ...VALID_SESSION }),
    false,
  )
})

test("AC-05: 확인이 끝났는데 활성 게임이 없으면(missing) 그때 비로소 리다이렉트한다", () => {
  assert.equal(
    shouldRedirectOutOfInGame({ snapshotSyncStatus: "missing", ...EMPTY_AFTER_REFRESH }),
    true,
  )
})

test("AC-05: checking이 아닌 다른 어떤 상태값에서도 무효한 세션은 리다이렉트한다", () => {
  for (const status of ["recovered", "missing", null, undefined, "", "CHECKING", "checking "]) {
    assert.equal(
      shouldRedirectOutOfInGame({ snapshotSyncStatus: status, ...EMPTY_AFTER_REFRESH }),
      true,
      `snapshotSyncStatus=${JSON.stringify(status)}는 checking이 아니므로 내보내야 한다`,
    )
  }
})

test("AC-05: 다른 게임의 잔상(state.id ≠ gameId)은 확인이 끝난 뒤 리다이렉트한다", () => {
  assert.equal(
    shouldRedirectOutOfInGame({
      snapshotSyncStatus: "recovered",
      gameId: "g1",
      gameState: { id: "g-other" },
    }),
    true,
  )
})

test("isValidInGameSession: gameId·state가 모두 있고 state.id가 일치할 때만 유효하다", () => {
  assert.equal(isValidInGameSession("g1", { id: "g1" }), true)
  assert.equal(isValidInGameSession("g1", { id: "g-other" }), false)
  assert.equal(isValidInGameSession("g1", null), false)
  assert.equal(isValidInGameSession(null, { id: "g1" }), false)
  assert.equal(isValidInGameSession(null, null), false)
  assert.equal(isValidInGameSession("", { id: "" }), false)
  assert.equal(isValidInGameSession("g1", undefined), false)
  assert.equal(isValidInGameSession("g1", "g1"), false)
})
