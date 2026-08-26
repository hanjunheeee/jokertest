import test from "node:test"
import assert from "node:assert/strict"
import { selectInGameTimebarStatusMessage } from "../selectInGameTimebarStatusMessage.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../../constants/timebar/ingameTimebarAssets.js"

/**
 * 상단 인디케이터 상태 문구 파생 — phase × 밤 역할 턴 조합.
 *
 * NIGHT 문구는 리터럴을 다시 쓰지 않고 INGAME_NIGHT_TURN_ANNOUNCEMENTS에서 뽑아 비교한다.
 * "문구를 새로 만들지 않고 밤 턴 안내 상수를 그대로 재사용한다"는 요구를 테스트가 함께 고정한다.
 */
function announcementOf(role) {
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role).message
}

test("NIGHT — canonical 역할 턴별로 밤 턴 안내와 같은 문구를 돌려준다", () => {
  for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    assert.equal(
      selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1, nightTurnRole: role }),
      announcementOf(role),
    )
  }
})

test("NIGHT 문구는 밤 턴 안내 상수와 같은 실제 문자열이다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER" }),
    "광대의 시간입니다",
  )
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" }),
    "의사의 시간입니다",
  )
})

test("NIGHT — 역할 턴이 명시되지 않으면 기존 파생 로직대로 그 밤의 시작 턴 문구를 쓴다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1 }),
    announcementOf("JOKER"),
  )
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1, nightTurnRole: null }),
    announcementOf("JOKER"),
  )
})

test("NIGHT — 첫 밤(dayIndex 0)의 마녀사냥꾼 턴도 dayIndex로 막지 않고 그 턴의 문구를 쓴다", () => {
  // 시신이 없는 밤에는 서버가 이 턴을 만들지 않으므로 프런트가 dayIndex로 흉내낼 필요가 없다.
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 0, nightTurnRole: "WITCH_HUNTER" }),
    announcementOf("WITCH_HUNTER"),
  )
})

test("NIGHT — 밤 행동이 없는 역할이나 무효한 dayIndex면 문구를 지어내지 않는다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "CITIZEN" }),
    null,
  )
  assert.equal(selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: -1 }), null)
  assert.equal(selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1.5 }), null)
  assert.equal(selectInGameTimebarStatusMessage({ phase: "NIGHT" }), null)
})

test("DAY / TRIBUNAL은 각 단계 문구를 돌려준다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "DAY", dayIndex: 2 }),
    INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  )
  assert.equal(selectInGameTimebarStatusMessage({ phase: "DAY", dayIndex: 2 }), "낮 — 토론과 투표")
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "TRIBUNAL", dayIndex: 2 }),
    INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
  )
  assert.equal(selectInGameTimebarStatusMessage({ phase: "TRIBUNAL", dayIndex: 2 }), "재판 진행 중")
})

test("ENDED는 문구를 표시하지 않는다(null)", () => {
  assert.equal(selectInGameTimebarStatusMessage({ phase: "ENDED", dayIndex: 3 }), null)
})

test("ROLE_REVEAL과 알 수 없는 phase도 null이다", () => {
  assert.equal(selectInGameTimebarStatusMessage({ phase: "ROLE_REVEAL", dayIndex: 0 }), null)
  assert.equal(selectInGameTimebarStatusMessage({ phase: "SOMETHING_ELSE", dayIndex: 1 }), null)
  assert.equal(selectInGameTimebarStatusMessage({ dayIndex: 1 }), null)
})

test("state가 아닌 입력에도 throw 없이 null이다", () => {
  for (const input of [null, undefined, 0, "NIGHT", [], [{ phase: "DAY" }]]) {
    assert.equal(selectInGameTimebarStatusMessage(input), null)
  }
})

// --- 연출 역할 override (실제 화면이 쓰는 경로) ---

test("NIGHT — override로 넘긴 연출 역할이 canonical 턴을 이긴다", () => {
  // 실제 화면(InGamePage)은 연출 릴의 현재 역할을 넘긴다. canonical 턴은 죽은 역할을 건너뛴
  // 판정용 값이라, 그것만 따르면 그 역할 보유자의 사망이 상태바에서 드러난다.
  assert.equal(
    selectInGameTimebarStatusMessage(
      { phase: "NIGHT", dayIndex: 2, nightTurnRole: "WITCH_HUNTER" },
      "GUARD",
    ),
    announcementOf("GUARD"),
  )
  // canonical 턴이 아예 없는(= 그 밤의 판정이 이미 끝난) 상태에서도 연출은 그대로 재생된다.
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 2, nightTurnRole: null }, "GUARD"),
    announcementOf("GUARD"),
  )
})

test("NIGHT — override가 유효한 문자열이 아니면 기존 canonical 파생으로 떨어진다(하위호환)", () => {
  for (const override of [null, undefined, "", 0, ["GUARD"]]) {
    assert.equal(
      selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" }, override),
      announcementOf("DOCTOR"),
    )
  }
})

test("NIGHT — 밤 행동이 없는 역할을 override로 넘기면 문구를 지어내지 않는다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER" }, "CITIZEN"),
    null,
  )
})

test("DAY/TRIBUNAL/ENDED는 override를 넘겨도 각 단계 문구를 그대로 쓴다", () => {
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "DAY", dayIndex: 2 }, "GUARD"),
    INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  )
  assert.equal(
    selectInGameTimebarStatusMessage({ phase: "TRIBUNAL", dayIndex: 2 }, "GUARD"),
    INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
  )
  assert.equal(selectInGameTimebarStatusMessage({ phase: "ENDED", dayIndex: 3 }, "GUARD"), null)
})
