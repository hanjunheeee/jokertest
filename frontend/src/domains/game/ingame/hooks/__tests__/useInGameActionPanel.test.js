import { InGamePlayerSessionContext } from "../../components/InGamePlayerSessionContext.js"
import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  computeDayVoteResolveAckPatch,
  shouldApplyDayVoteResolvedPayload,
  parseDayVoteResolvedPayload,
  computeDayVoteResolveInvalidatePatch,
  useInGameActionPanel,
} from "../useInGameActionPanel.js"
import { useInGameStore } from "../../store/ingameStore.js"

// ---------------------------------------------------------------------------
// computeDayVoteResolveAckPatch
// ---------------------------------------------------------------------------

test("computeDayVoteResolveAckPatch: {ok:true, outcome, tribunalTargetUuid}이면 {status:'resolved', error:null, resolution}을 반환한다", () => {
  assert.deepEqual(
    computeDayVoteResolveAckPatch({ ok: true, gameId: "g1", dayIndex: 1, outcome: "TRIBUNAL", tribunalTargetUuid: "u1" }),
    { status: "resolved", error: null, resolution: { outcome: "TRIBUNAL", tribunalTargetUuid: "u1" } },
  )
})

test("computeDayVoteResolveAckPatch: TIE/ABSTAINED처럼 tribunalTargetUuid가 없으면 null로 채운다", () => {
  const result = computeDayVoteResolveAckPatch({ ok: true, gameId: "g1", dayIndex: 1, outcome: "TIE" })
  assert.deepEqual(result, { status: "resolved", error: null, resolution: { outcome: "TIE", tribunalTargetUuid: null } })
})

test("computeDayVoteResolveAckPatch: {ok:false, message}면 그 message를 error로 담아 {status:'idle', resolution:null}을 반환한다", () => {
  assert.deepEqual(computeDayVoteResolveAckPatch({ ok: false, message: "X" }), {
    status: "idle",
    error: "X",
    resolution: null,
  })
})

test("computeDayVoteResolveAckPatch: {ok:false}만 있고 message가 없으면 기본 에러 문구를 담는다", () => {
  const result = computeDayVoteResolveAckPatch({ ok: false })
  assert.equal(result.status, "idle")
  assert.equal(result.resolution, null)
  assert.equal(typeof result.error, "string")
  assert.notEqual(result.error, null)
})

test("computeDayVoteResolveAckPatch: 응답이 없어도(undefined) 실패로 취급해 status:'idle'을 반환한다", () => {
  const result = computeDayVoteResolveAckPatch(undefined)
  assert.equal(result.status, "idle")
  assert.equal(result.resolution, null)
  assert.equal(typeof result.error, "string")
})

// ---------------------------------------------------------------------------
// shouldApplyDayVoteResolvedPayload — 활성 dayIndex가 정수일 때만 정확히 일치해야 통과한다
// ---------------------------------------------------------------------------

test("shouldApplyDayVoteResolvedPayload: gameId와 dayIndex가 모두 정확히 일치하면 true다", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "g1", dayIndex: 1 }, gameId: "g1", dayIndex: 1 }),
    true,
  )
})

test("shouldApplyDayVoteResolvedPayload: 활성 dayIndex가 정수가 아니면(예: undefined) 항상 false다 — undefined일 때 전부 통과하던 구멍을 막는다", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "g1", dayIndex: 99 }, gameId: "g1", dayIndex: undefined }),
    false,
  )
})

test("shouldApplyDayVoteResolvedPayload: gameId가 다르면 false다(다른 게임의 늦은 방송)", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "other", dayIndex: 1 }, gameId: "g1", dayIndex: 1 }),
    false,
  )
})

test("shouldApplyDayVoteResolvedPayload: dayIndex가 다르면 false다(이전 낮의 늦은 방송, stale)", () => {
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: { gameId: "g1", dayIndex: 0 }, gameId: "g1", dayIndex: 1 }),
    false,
  )
})

test("shouldApplyDayVoteResolvedPayload: payload가 없거나 객체가 아니거나 배열이면 false다", () => {
  assert.equal(shouldApplyDayVoteResolvedPayload({ payload: null, gameId: "g1", dayIndex: 1 }), false)
  assert.equal(shouldApplyDayVoteResolvedPayload({ payload: undefined, gameId: "g1", dayIndex: 1 }), false)
  assert.equal(shouldApplyDayVoteResolvedPayload({ payload: "not-an-object", gameId: "g1", dayIndex: 1 }), false)
  assert.equal(
    shouldApplyDayVoteResolvedPayload({ payload: [{ gameId: "g1", dayIndex: 1 }], gameId: "g1", dayIndex: 1 }),
    false,
  )
})

// ---------------------------------------------------------------------------
// parseDayVoteResolvedPayload — outcome/phase/집계값 계약 전체를 검증하는 parser
// ---------------------------------------------------------------------------

function baseGameId() {
  return "g1"
}

test("parseDayVoteResolvedPayload: TRIBUNAL 판정 payload가 올바르면 파싱된 결과를 반환한다", () => {
  const payload = {
    gameId: baseGameId(),
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.deepEqual(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  })
})

test("parseDayVoteResolvedPayload: TIE 판정 payload가 올바르면 tribunalTargetUuid를 null로 파싱한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  const result = parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 })
  assert.equal(result.outcome, "TIE")
  assert.equal(result.tribunalTargetUuid, null)
})

test("parseDayVoteResolvedPayload: ABSTAINED 판정 payload가 올바르면 파싱된다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 2,
    phase: "DAY",
    outcome: "ABSTAINED",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  const result = parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 2 })
  assert.equal(result.outcome, "ABSTAINED")
  assert.equal(result.publicAbstainCount, 3)
})

test("parseDayVoteResolvedPayload: TRIBUNAL인데 tribunalTargetUuid가 없으면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: publicVoteCount/publicAbstainCount가 없거나 음수/실수면 null을 반환한다", () => {
  const withoutCounts = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload: withoutCounts, gameId: "g1", dayIndex: 1 }), null)

  const negativeCount = { ...withoutCounts, publicVoteCount: -1, publicAbstainCount: 0 }
  assert.equal(parseDayVoteResolvedPayload({ payload: negativeCount, gameId: "g1", dayIndex: 1 }), null)

  const fractionalCount = { ...withoutCounts, publicVoteCount: 1.5, publicAbstainCount: 0 }
  assert.equal(parseDayVoteResolvedPayload({ payload: fractionalCount, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: outcome이 오타(TRIBUNALL)이거나 허용되지 않는 값이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNALL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: payload가 배열이면 null을 반환한다", () => {
  const payload = [{ gameId: "g1", dayIndex: 1, phase: "DAY", outcome: "TIE" }]
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: outcome과 phase 조합이 불일치하면(TRIBUNAL인데 phase가 DAY) null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: TIE인데 phase가 TRIBUNAL이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: 활성 dayIndex와 다른 stale payload는 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 0,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: 다른 게임의 방송(gameId 불일치)은 null을 반환한다", () => {
  const payload = {
    gameId: "other-game",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: 비-TRIBUNAL(TIE/ABSTAINED)인데 tribunalTargetUuid 필드 자체가 없어 undefined면 null을 반환한다", () => {
  const tiePayload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    publicVoteCount: 3,
    publicAbstainCount: 0,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload: tiePayload, gameId: "g1", dayIndex: 1 }), null)

  const abstainedPayload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "ABSTAINED",
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload: abstainedPayload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: publicAbstainCount가 publicVoteCount보다 크면 outcome과 무관하게 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "ABSTAINED",
    tribunalTargetUuid: null,
    publicVoteCount: 2,
    publicAbstainCount: 5,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: ABSTAINED인데 publicVoteCount와 publicAbstainCount가 다르면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "ABSTAINED",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 2,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: TIE인데 유효표가 하나도 없이 전원 기권(publicVoteCount === publicAbstainCount)이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "DAY",
    outcome: "TIE",
    tribunalTargetUuid: null,
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

test("parseDayVoteResolvedPayload: TRIBUNAL인데 유효표가 하나도 없이 전원 기권(publicVoteCount === publicAbstainCount)이면 null을 반환한다", () => {
  const payload = {
    gameId: "g1",
    dayIndex: 1,
    phase: "TRIBUNAL",
    outcome: "TRIBUNAL",
    tribunalTargetUuid: "u1",
    publicVoteCount: 3,
    publicAbstainCount: 3,
  }
  assert.equal(parseDayVoteResolvedPayload({ payload, gameId: "g1", dayIndex: 1 }), null)
})

// ---------------------------------------------------------------------------
// computeDayVoteResolveInvalidatePatch
// ---------------------------------------------------------------------------

test("computeDayVoteResolveInvalidatePatch: mounted면 {status:'idle', error:null, resolution:null}을 반환한다", () => {
  assert.deepEqual(computeDayVoteResolveInvalidatePatch(true), { status: "idle", error: null, resolution: null })
})

test("computeDayVoteResolveInvalidatePatch: unmounted면 null을 반환해 state를 건드리지 않음을 나타낸다", () => {
  assert.equal(computeDayVoteResolveInvalidatePatch(false), null)
})

// ---------------------------------------------------------------------------
// useInGameActionPanel — DAY phase 렌더링 회귀 테스트 (TDZ ReferenceError 방지)
// ---------------------------------------------------------------------------

test("useInGameActionPanel: DAY phase 상태에서 실제로 렌더링해도 dayVoteControlsEnabled 계산 중 ReferenceError 없이 완료된다", () => {
  useInGameStore.setState({
    gameId: "game-1",
    state: {
      phase: "DAY",
      dayIndex: 1,
      self: { role: "CITIZEN" },
      players: [],
      events: [],
    },
    error: null,
  })

  let captured = null
  function Probe() {
    captured = useInGameActionPanel()
    return null
  }

  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(
        InGamePlayerSessionContext.Provider,
        { value: {} },
        React.createElement(Probe),
      ),
    )
  })
  assert.equal(typeof captured.dayVoteControlsEnabled, "boolean")
})
