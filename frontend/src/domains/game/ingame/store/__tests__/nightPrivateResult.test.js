import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { useInGameStore } from "../ingameStore.js"
import { parseInGameNightPrivateResultPayload } from "../../utils/reduceInGameNightPrivateResult.js"

// ---------------------------------------------------------------------------
// AC-04 · nightPrivateResult는 오버레이 확인·NIGHT 재진입·gameId 변경에서만 비워지고,
//         이벤트 순차 적용과 snapshot 복구를 지나도 유실되지 않는다.
//
// useGameSessionSocketEvents 자체는 `@/domains/...` 별칭 import를 포함해 node --test로
// 로드할 수 없으므로(테스트 로더를 새로 들이지 않는다), 이 파일은 두 가지를 나눠 증명한다:
//   (1) 상태 계약 — 훅이 실제로 부르는 파서·store 액션을 이벤트 도착 순서대로 직접 호출한다.
//   (2) 소스 배선 — 훅이 그 파서와 액션을 그 순서로 잇고 있는지 production 소스에서 확인한다.
// ---------------------------------------------------------------------------

const GAME_ID = "game-npr-store"
const SELF_UUID = "uuid-self"
const OTHER_UUID = "uuid-other"

const ROSTER = [
  { uuid: SELF_UUID, nickname: "나" },
  { uuid: OTHER_UUID, nickname: "상대" },
]

function buildSelf() {
  return { uuid: SELF_UUID, nickname: "나", role: "GUARD", team: "CITIZEN", hasActedThisPhase: false }
}

/** 밤(dayIndex 1)에 들어와 있는 세션을 세운다 — 개인 결과가 도착할 수 있는 유일한 시점이다. */
function seedNightSession({ gameId = GAME_ID } = {}) {
  useInGameStore.setState({
    gameId: null,
    state: null,
    hostUuid: null,
    error: null,
    snapshotSeq: 0,
    nightPrivateResult: null,
  })
  useInGameStore.getState().setGamePayload({
    gameId,
    state: {
      id: gameId,
      phase: "NIGHT",
      dayIndex: 1,
      dayPhase: null,
      players: ROSTER.map((p) => ({ ...p })),
      self: buildSelf(),
    },
  })
}

/** useGameSessionSocketEvents의 night_action_result 핸들러와 같은 순서로 store에 반영한다. */
function receiveNightActionResult(payload) {
  const current = useInGameStore.getState()
  if (!current.gameId || !current.state) return
  const parsed = parseInGameNightPrivateResultPayload({
    payload,
    gameId: current.gameId,
    dayIndex: current.state.dayIndex,
    phase: current.state.phase,
    selfRole: current.state.self?.role ?? null,
  })
  if (!parsed) return
  useInGameStore.getState().setNightPrivateResult(parsed)
}

const GUARD_RESULT = Object.freeze({
  gameId: GAME_ID,
  dayIndex: 1,
  actionType: "INVESTIGATE",
  targetId: OTHER_UUID,
  role: "JOKER",
})

/** 그 밤의 결과 적용(사망 + DAY 전이) — 서버가 개인 결과 "다음에" 보내는 방송이다. */
function applyNightResultToDay() {
  useInGameStore.getState().applyNightResultAppliedPayload({
    gameId: GAME_ID,
    phase: "DAY",
    dayIndex: 2,
    players: [
      { uuid: SELF_UUID, alive: true },
      { uuid: OTHER_UUID, alive: false },
    ],
    victimUuid: OTHER_UUID,
  })
}

/** 같은 게임의 재접속 스냅샷(DAY 2로 복원). */
function applyDaySnapshot() {
  useInGameStore.getState().applySessionSnapshot({
    ok: true,
    gameId: GAME_ID,
    phase: "DAY",
    dayIndex: 2,
    dayPhase: "DAY_DISCUSSION",
    players: [
      { uuid: SELF_UUID, nickname: "나", isAlive: true, isConnected: true },
      { uuid: OTHER_UUID, nickname: "상대", isAlive: false, isConnected: true },
    ],
    self: buildSelf(),
  })
}

test("AC-04: 개인 결과는 밤에 도착해 저장되고, night_result_applied·snapshot 복구를 지나도 유실되지 않는다", () => {
  seedNightSession()

  receiveNightActionResult(GUARD_RESULT)
  assert.deepEqual(useInGameStore.getState().nightPrivateResult, {
    gameId: GAME_ID,
    dayIndex: 1,
    actionType: "INVESTIGATE",
    targetId: OTHER_UUID,
    role: "JOKER",
  })

  // 이벤트 순차 적용 — 서버가 개인 결과 직후에 보내는 밤 결과 방송은 값을 비우지 않는다.
  applyNightResultToDay()
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null, "night_result_applied가 개인 결과를 지웠다")

  // snapshot 복구 — state를 통째로 갈아끼워도 최상위 개인 결과는 그대로다.
  const seqBefore = useInGameStore.getState().snapshotSeq
  applyDaySnapshot()
  assert.equal(useInGameStore.getState().snapshotSeq, seqBefore + 1, "스냅샷이 실제로 반영돼야 하는 시험이다")
  assert.equal(useInGameStore.getState().nightPrivateResult.targetId, OTHER_UUID, "snapshot 복구가 개인 결과를 지웠다")
})

test("AC-04: 같은 NIGHT의 중복 이벤트는 재진입이 아니다 — 값이 사라지지 않는다", () => {
  seedNightSession()
  receiveNightActionResult(GUARD_RESULT)

  // 같은 밤에 대한 중복 방송(늦게 도착한 재전송)을 그대로 다시 적용해도 값은 그대로다.
  receiveNightActionResult(GUARD_RESULT)
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null)

  // 같은 밤 phase를 다시 관측하는 스냅샷도 재진입이 아니다.
  useInGameStore.getState().applySessionSnapshot({
    ok: true,
    gameId: GAME_ID,
    phase: "NIGHT",
    dayIndex: 1,
    players: [
      { uuid: SELF_UUID, nickname: "나", isAlive: true, isConnected: true },
      { uuid: OTHER_UUID, nickname: "상대", isAlive: true, isConnected: true },
    ],
    self: buildSelf(),
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null, "같은 밤 스냅샷을 재진입으로 오인했다")
})

test("AC-04: 오버레이 확인은 개인 결과를 비운다(중복 확인은 참조 보존 no-op)", () => {
  seedNightSession()
  receiveNightActionResult(GUARD_RESULT)
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null)

  useInGameStore.getState().clearNightPrivateResult()
  assert.equal(useInGameStore.getState().nightPrivateResult, null)

  const before = useInGameStore.getState()
  useInGameStore.getState().clearNightPrivateResult()
  assert.equal(useInGameStore.getState(), before, "이미 비어 있으면 아무것도 바뀌지 않는다")
})

test("AC-04: NIGHT 재진입(낮 투표 동률 → 밤)에서 개인 결과를 비운다", () => {
  seedNightSession()
  receiveNightActionResult(GUARD_RESULT)
  applyNightResultToDay()
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null)

  useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 2, {
    outcome: "TIE",
    defendantUuid: null,
    round: 1,
    revoteExcludedUuids: [],
    publicVoteCount: 1,
    publicAbstainCount: 1,
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().nightPrivateResult, null, "새 밤에 지난 밤의 개인 결과가 남았다")
})

test("AC-04: NIGHT 재진입(재판 무죄 → 밤)에서도 개인 결과를 비운다", () => {
  seedNightSession()
  receiveNightActionResult(GUARD_RESULT)

  // 재판 중인 낮으로 옮겨 놓는다(store 액션이 만드는 것과 같은 모양).
  useInGameStore.setState((current) => ({
    state: { ...current.state, phase: "TRIBUNAL", dayIndex: 2, dayPhase: null, tribunal: { defendantUuid: OTHER_UUID } },
  }))
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null)

  useInGameStore.getState().applyTribunalResolved({
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: OTHER_UUID,
    outcome: "NOT_GUILTY",
    counts: { guilty: 1, notGuilty: 2 },
    executedUuid: null,
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("AC-04: 재판이 밤으로 넘어가지 않는 판정(유죄 처형·ENDED 아님)은 개인 결과를 비우지 않는다", () => {
  seedNightSession()
  receiveNightActionResult(GUARD_RESULT)
  useInGameStore.setState((current) => ({
    state: { ...current.state, phase: "TRIBUNAL", dayIndex: 2, dayPhase: null, tribunal: { defendantUuid: OTHER_UUID } },
  }))

  useInGameStore.getState().applyTribunalResolved({
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "TRIBUNAL",
    defendantUuid: OTHER_UUID,
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: OTHER_UUID,
  })

  assert.equal(useInGameStore.getState().state.tribunal.resolved, true)
  assert.notEqual(useInGameStore.getState().nightPrivateResult, null, "TRIBUNAL에 머무는 판정은 재진입이 아니다")
})

test("AC-04: gameId 변경(새 세션·정리)에서 개인 결과를 비운다", () => {
  seedNightSession()
  receiveNightActionResult(GUARD_RESULT)

  useInGameStore.getState().setGamePayload({
    gameId: "game-next",
    state: {
      id: "game-next",
      phase: "ROLE_REVEAL",
      dayIndex: 0,
      players: ROSTER.map((p) => ({ ...p })),
      self: buildSelf(),
    },
  })
  assert.equal(useInGameStore.getState().nightPrivateResult, null, "이전 게임의 개인 결과가 새 세션으로 샜다")

  seedNightSession()
  receiveNightActionResult(GUARD_RESULT)
  useInGameStore.getState().clearGame()
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("AC-04: 다른 게임의 개인 결과는 store에 들어가지 않는다", () => {
  seedNightSession()
  receiveNightActionResult({ ...GUARD_RESULT, gameId: "game-other" })
  assert.equal(useInGameStore.getState().nightPrivateResult, null)

  // 파서를 우회해 store 액션을 직접 불러도 gameId 불일치는 참조 보존 no-op이다.
  const before = useInGameStore.getState()
  useInGameStore.getState().setNightPrivateResult({ ...GUARD_RESULT, gameId: "game-other" })
  assert.equal(useInGameStore.getState(), before)
})

test("AC-04: useGameSessionSocketEvents가 night_action_result를 파서와 store 액션으로 잇는다", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../hooks/useGameSessionSocketEvents.js", import.meta.url)),
    "utf8",
  )

  assert.match(source, /import \{ parseInGameNightPrivateResultPayload \} from "\.\.\/utils\/reduceInGameNightPrivateResult\.js"/)
  assert.match(source, /socket\.on\("night_action_result", handleNightActionResult\)/)
  assert.match(source, /socket\.off\("night_action_result", handleNightActionResult\)/)

  const handler = source.match(/const handleNightActionResult = \(payload\) => \{[\s\S]*?\n {4}\}/)
  assert.notEqual(handler, null, "night_action_result 핸들러를 찾을 수 없다")
  // 렌더 시점 클로저가 아니라 도착 시점의 store에서 신뢰 경계를 다시 읽는다.
  assert.match(handler[0], /useInGameStore\.getState\(\)/)
  assert.match(handler[0], /gameId: current\.gameId/)
  assert.match(handler[0], /dayIndex: current\.state\.dayIndex/)
  assert.match(handler[0], /phase: current\.state\.phase/)
  assert.match(handler[0], /selfRole: current\.state\.self\?\.role \?\? null/)
  assert.match(handler[0], /setNightPrivateResult\(parsed\)/)
})
