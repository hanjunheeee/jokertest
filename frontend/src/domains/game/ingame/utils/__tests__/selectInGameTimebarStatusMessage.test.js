import test from "node:test"
import assert from "node:assert/strict"
import { selectInGameTimebarStatusMessage } from "../selectInGameTimebarStatusMessage.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../../constants/timebar/ingameTimebarAssets.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"

function buildState(patch = {}) {
  return { phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER", ...patch }
}

test("selectInGameTimebarStatusMessage: DAY·TRIBUNAL은 고정 문구를 쓴다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage(buildState({ phase: "DAY" })),
    INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  )
  assert.equal(
    selectInGameTimebarStatusMessage(buildState({ phase: "TRIBUNAL" })),
    INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
  )
})

test("selectInGameTimebarStatusMessage: DAY·TRIBUNAL 문구는 남은 시간에 흔들리지 않는다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage(buildState({ phase: "DAY" }), 12),
    INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  )
})

test("selectInGameTimebarStatusMessage: NIGHT 문구는 밤 턴 안내 사전을 그대로 재사용한다", () => {
  for (const { role, message } of INGAME_NIGHT_TURN_ANNOUNCEMENTS) {
    assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: role })), message)
  }
})

test("selectInGameTimebarStatusMessage: 남은 시간이 있으면 역할 문구 뒤에 초를 덧붙인다", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState(), 30), "광대의 시간입니다 · 30초")
  assert.equal(selectInGameTimebarStatusMessage(buildState(), 0), "광대의 시간입니다 · 0초")
})

test("selectInGameTimebarStatusMessage: 남은 시간을 계산할 수 없으면 역할 문구만 남는다", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState(), null), "광대의 시간입니다")
  assert.equal(selectInGameTimebarStatusMessage(buildState(), undefined), "광대의 시간입니다")
  assert.equal(selectInGameTimebarStatusMessage(buildState(), Number.NaN), "광대의 시간입니다")
  assert.equal(selectInGameTimebarStatusMessage(buildState(), Number.POSITIVE_INFINITY), "광대의 시간입니다")
  assert.equal(selectInGameTimebarStatusMessage(buildState(), -1), "광대의 시간입니다")
  assert.equal(selectInGameTimebarStatusMessage(buildState(), "30"), "광대의 시간입니다")
})

test("selectInGameTimebarStatusMessage: 서버가 지목한 역할이 없는 밤은 문구를 지어내지 않는다", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: null })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: undefined })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: "" })), null)
})

test("selectInGameTimebarStatusMessage: 밤 행동이 없는·모르는 역할은 숨긴다(문구 누출 없음)", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: "CITIZEN" })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: "UNKNOWN" })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: "CITIZEN" }), 30), null)
})

test("selectInGameTimebarStatusMessage: 무효한 dayIndex의 밤은 문구가 없다", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState({ dayIndex: -1 })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ dayIndex: 1.5 })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ dayIndex: "1" })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ dayIndex: undefined })), null)
})

test("selectInGameTimebarStatusMessage: ENDED·ROLE_REVEAL·모르는 phase는 문구를 붙이지 않는다", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState({ phase: "ENDED" })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ phase: "ROLE_REVEAL" })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ phase: "WHAT" })), null)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ phase: undefined })), null)
})

test("selectInGameTimebarStatusMessage: state가 없거나 형태가 어긋나도 throw하지 않는다", () => {
  assert.equal(selectInGameTimebarStatusMessage(null), null)
  assert.equal(selectInGameTimebarStatusMessage(undefined), null)
  assert.equal(selectInGameTimebarStatusMessage([]), null)
  assert.equal(selectInGameTimebarStatusMessage("NIGHT"), null)
  assert.equal(selectInGameTimebarStatusMessage(7), null)
})

test("selectInGameTimebarStatusMessage: 문구는 state.nightTurnRole 하나에서만 나온다(다른 플레이어 역할 무관)", () => {
  const withPlayers = buildState({
    nightTurnRole: "DOCTOR",
    players: [
      { id: "p1", role: "WITCH_HUNTER" },
      { id: "p2", role: "JOKER" },
    ],
  })
  assert.equal(selectInGameTimebarStatusMessage(withPlayers), "의사의 시간입니다")
})
