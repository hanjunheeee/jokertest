import test from "node:test"
import assert from "node:assert/strict"
import { selectInGameTimebarStatusMessage } from "../selectInGameTimebarStatusMessage.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../../constants/timebar/ingameTimebarAssets.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
import { formatInGameTimebarPhaseTag } from "../formatInGameTimebarPhaseTag.js"

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

test("selectInGameTimebarStatusMessage: 두 번째 인자(남은 초)는 무시한다 — 타이머는 확대 UI 전용", () => {
  assert.equal(
    selectInGameTimebarStatusMessage(buildState({ phase: "DAY" }), 12),
    INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  )
  assert.equal(
    selectInGameTimebarStatusMessage(buildState(), 30),
    formatInGameTimebarPhaseTag("밤", "광대"),
  )
})

test("selectInGameTimebarStatusMessage: NIGHT 태그는 밤 턴 안내 label을 [밤-{label}]로 쓴다", () => {
  for (const { role, label } of INGAME_NIGHT_TURN_ANNOUNCEMENTS) {
    assert.equal(
      selectInGameTimebarStatusMessage(buildState({ nightTurnRole: role })),
      formatInGameTimebarPhaseTag("밤", label),
    )
  }
})

test("selectInGameTimebarStatusMessage: 역할 턴이 없는 밤은 기본 「밤 활동 시간」 문구를 쓴다", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: null })), INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: undefined })), INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: "" })), INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE)
})

test("selectInGameTimebarStatusMessage: 알 수 없는 nightTurnRole은 역할명을 노출하지 않고 기본 밤 문구만 쓴다", () => {
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: "CITIZEN" })), INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE)
  assert.equal(selectInGameTimebarStatusMessage(buildState({ nightTurnRole: "UNKNOWN" })), INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE)
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
  assert.equal(
    selectInGameTimebarStatusMessage(withPlayers),
    formatInGameTimebarPhaseTag("밤", "의사"),
  )
})
