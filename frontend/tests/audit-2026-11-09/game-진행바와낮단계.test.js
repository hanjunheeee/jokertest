// 6차 묶음: 진행(시간) 바 글자·마커·마감 계산과 낮 세부 단계·낮 투표 판정 방송 검사(TRIBUNAL/TIE/ABSTAINED)
import test from "node:test"
import assert from "node:assert/strict"

import {
  formatInGameTimebarClock,
  formatInGameTimebarPhaseTag,
} from "../../src/domains/game/ingame/utils/timebar/format.js"
import {
  computeMarkerLeftPercent,
  computeMarkerOpacity,
} from "../../src/domains/game/ingame/utils/timebar/marker.js"
import { selectInGameTimebarPhaseDeadline } from "../../src/domains/game/ingame/utils/timebar/phaseDeadline.js"
import {
  INGAME_DAY_PHASES,
  parseDayPhaseChangedPayload,
  parseDayPhaseDeadlineField,
  resolveInGameDayPhase,
} from "../../src/domains/game/ingame/utils/dayPhase.js"
import {
  computeDayVoteResolveAckPatch,
  computeDayVoteResolveInvalidatePatch,
  parseDayVoteResolvedPayload,
} from "../../src/domains/game/ingame/utils/dayVoteResolve.js"
import { getDayVoteRound, parseDayVoteRoundFields } from "../../src/domains/game/ingame/utils/dayVoteRound.js"

test("진행 바 시계: 남은 초를 MM:SS로", () => {
  assert.equal(formatInGameTimebarClock(0), "00:00")
  assert.equal(formatInGameTimebarClock(65), "01:05")
  assert.equal(formatInGameTimebarClock(599.9), "09:59")
})

test("진행 바 시계: 음수·NaN·무한대는 00:00", () => {
  assert.equal(formatInGameTimebarClock(-3), "00:00")
  assert.equal(formatInGameTimebarClock(Number.NaN), "00:00")
  assert.equal(formatInGameTimebarClock(Infinity), "00:00")
})

test("진행 바 단계 글: [구분-세부], 하나라도 비면 빈 글", () => {
  assert.equal(formatInGameTimebarPhaseTag("낮", "토론과 투표"), "[낮-토론과 투표]")
  assert.equal(formatInGameTimebarPhaseTag("", "토론"), "")
  assert.equal(formatInGameTimebarPhaseTag("낮", null), "")
})

test("진행 바 마커: 게이지 0이면 왼쪽 안쪽 끝(4.5%), 1이면 오른쪽 안쪽 끝(78%)", () => {
  assert.equal(computeMarkerLeftPercent(0), 4.5)
  assert.equal(computeMarkerLeftPercent(1), 78)
})

test("진행 바 마커: 게이지 비율은 0~1로 잘림", () => {
  assert.equal(computeMarkerLeftPercent(-1), 4.5)
  assert.equal(computeMarkerLeftPercent(5), 78)
  assert.equal(computeMarkerLeftPercent(0.5), 4.5 + 73.5 / 2)
})

test("진행 바 마커 흐려짐: 8초 이상은 그대로, 아래면 비례해 흐려짐", () => {
  assert.equal(computeMarkerOpacity(8), 1)
  assert.equal(computeMarkerOpacity(30), 1)
  assert.equal(computeMarkerOpacity(4), 0.5)
  assert.equal(computeMarkerOpacity(0), 0)
})

test("진행 바 마커 흐려짐: 셀 시간이 없거나 음수면 그대로 보임", () => {
  assert.equal(computeMarkerOpacity(Number.NaN), 1)
  assert.equal(computeMarkerOpacity(-1), 1)
})

test("진행 바 마감: 밤엔 역할 차례 마감, 낮엔 낮 단계 마감", () => {
  assert.equal(selectInGameTimebarPhaseDeadline({ phase: "NIGHT", nightTurnDeadline: 1000, dayPhaseDeadline: 5 }), 1000)
  assert.equal(selectInGameTimebarPhaseDeadline({ phase: "DAY", nightTurnDeadline: 5, dayPhaseDeadline: 2000 }), 2000)
})

test("진행 바 마감: 재판·끝남 단계는 마감 없음", () => {
  assert.equal(selectInGameTimebarPhaseDeadline({ phase: "TRIBUNAL", dayPhaseDeadline: 2000 }), null)
  assert.equal(selectInGameTimebarPhaseDeadline({ phase: "ENDED", nightTurnDeadline: 2000 }), null)
})

test("진행 바 마감: 0·음수·글자 마감 시각과 틀린 상태는 null", () => {
  assert.equal(selectInGameTimebarPhaseDeadline({ phase: "DAY", dayPhaseDeadline: 0 }), null)
  assert.equal(selectInGameTimebarPhaseDeadline({ phase: "NIGHT", nightTurnDeadline: "1000" }), null)
  assert.equal(selectInGameTimebarPhaseDeadline(null), null)
  assert.equal(selectInGameTimebarPhaseDeadline([]), null)
})

test("낮 세부 단계: 낮이 아니면 null, 투표면 투표, 그 밖엔 토론", () => {
  assert.equal(resolveInGameDayPhase({ phase: "NIGHT", dayPhase: "DAY_VOTE" }), null)
  assert.equal(resolveInGameDayPhase({ phase: "DAY", dayPhase: "DAY_VOTE" }), INGAME_DAY_PHASES.VOTE)
  assert.equal(resolveInGameDayPhase({ phase: "DAY" }), INGAME_DAY_PHASES.DISCUSSION)
  assert.equal(resolveInGameDayPhase(null), null)
})

test("낮 마감 칸: 칸 없음 undefined, 틀린 값 null, 맞으면 시각", () => {
  assert.equal(parseDayPhaseDeadlineField({}), undefined)
  assert.equal(parseDayPhaseDeadlineField({ dayPhaseDeadline: -5 }), null)
  assert.equal(parseDayPhaseDeadlineField({ dayPhaseDeadline: 1234 }), 1234)
})

test("낮 투표 시작 알림: 지금 판·날짜·투표 단계면 받고 마감 시각도 실음", () => {
  const r = parseDayPhaseChangedPayload({
    payload: { gameId: "g", dayIndex: 2, dayPhase: "DAY_VOTE", round: 1, dayPhaseDeadline: 999 },
    gameId: "g",
    dayIndex: 2,
  })
  assert.deepEqual(r, { gameId: "g", dayIndex: 2, dayPhase: "DAY_VOTE", round: 1, dayPhaseDeadline: 999 })
})

test("낮 투표 시작 알림: 다른 판·다른 날·토론 단계·회차 0은 거절", () => {
  const ok = { gameId: "g", dayIndex: 2, dayPhase: "DAY_VOTE", round: 1 }
  assert.equal(parseDayPhaseChangedPayload({ payload: ok, gameId: "h", dayIndex: 2 }), null)
  assert.equal(parseDayPhaseChangedPayload({ payload: ok, gameId: "g", dayIndex: 3 }), null)
  assert.equal(parseDayPhaseChangedPayload({ payload: { ...ok, dayPhase: "DAY_DISCUSSION" }, gameId: "g", dayIndex: 2 }), null)
  assert.equal(parseDayPhaseChangedPayload({ payload: { ...ok, round: 0 }, gameId: "g", dayIndex: 2 }), null)
})

test("낮 투표 시작 알림: 마감 시각 칸이 틀리면 알림 전체를 거절", () => {
  const p = { gameId: "g", dayIndex: 2, dayPhase: "DAY_VOTE", round: 1, dayPhaseDeadline: "soon" }
  assert.equal(parseDayPhaseChangedPayload({ payload: p, gameId: "g", dayIndex: 2 }), null)
})

const resolved = (extra) => ({
  gameId: "g",
  dayIndex: 1,
  phase: "TRIBUNAL",
  outcome: "TRIBUNAL",
  tribunalTargetUuid: "u-3",
  publicVoteCount: 4,
  publicAbstainCount: 1,
  ...extra,
})
const parse = (payload) => parseDayVoteResolvedPayload({ payload, gameId: "g", dayIndex: 1 })

test("낮 투표 판정 TRIBUNAL: 재판 단계·피고 있음·표가 기권보다 많으면 받음", () => {
  const r = parse(resolved())
  assert.equal(r.outcome, "TRIBUNAL")
  assert.equal(r.tribunalTargetUuid, "u-3")
  assert.equal(r.phase, "TRIBUNAL")
})

test("낮 투표 판정 TRIBUNAL: 피고 없거나 표=기권이거나 밤으로 가면 거절", () => {
  assert.equal(parse(resolved({ tribunalTargetUuid: "" })), null)
  assert.equal(parse(resolved({ publicVoteCount: 2, publicAbstainCount: 2 })), null)
  assert.equal(parse(resolved({ phase: "NIGHT" })), null)
})

test("낮 투표 판정 TIE: 밤으로·피고 null·표가 기권보다 많으면 받음", () => {
  const r = parse(resolved({ outcome: "TIE", phase: "NIGHT", tribunalTargetUuid: null }))
  assert.equal(r.outcome, "TIE")
  assert.equal(r.tribunalTargetUuid, null)
})

test("낮 투표 판정 TIE: 피고가 실려 오거나 재판으로 가면 거절", () => {
  assert.equal(parse(resolved({ outcome: "TIE", phase: "NIGHT", tribunalTargetUuid: "u-3" })), null)
  assert.equal(parse(resolved({ outcome: "TIE", phase: "TRIBUNAL", tribunalTargetUuid: null })), null)
})

test("낮 투표 판정 ABSTAINED: 전부 기권이면 받고, 표가 기권보다 많으면 거절", () => {
  const ok = resolved({ outcome: "ABSTAINED", phase: "NIGHT", tribunalTargetUuid: null, publicVoteCount: 3, publicAbstainCount: 3 })
  assert.equal(parse(ok).outcome, "ABSTAINED")
  assert.equal(parse({ ...ok, publicVoteCount: 4 }), null)
})

test("낮 투표 판정: 재투표(REVOTE)와 낮 그대로 단계는 안 받음", () => {
  assert.equal(parse(resolved({ outcome: "REVOTE", phase: "DAY", tribunalTargetUuid: null })), null)
  assert.equal(parse(resolved({ phase: "DAY" })), null)
})

test("낮 투표 판정: 기권이 표 수보다 많거나 음수·소수 표 수면 거절", () => {
  assert.equal(parse(resolved({ publicAbstainCount: 5 })), null)
  assert.equal(parse(resolved({ publicVoteCount: -1 })), null)
  assert.equal(parse(resolved({ publicVoteCount: 1.5 })), null)
})

test("낮 투표 판정: 다른 판·다른 날 방송은 거절", () => {
  assert.equal(parseDayVoteResolvedPayload({ payload: resolved(), gameId: "h", dayIndex: 1 }), null)
  assert.equal(parseDayVoteResolvedPayload({ payload: resolved(), gameId: "g", dayIndex: 2 }), null)
})

test("낮 투표 판정: 옛 칸 round는 1 이상이면 실어 주고 0이면 거절", () => {
  assert.equal(parse(resolved({ round: 1 })).round, 1)
  assert.equal(parse(resolved({ round: 0 })), null)
  assert.equal(Object.hasOwn(parse(resolved()), "round"), false)
})

test("낮 투표 판정 응답 조각: 성공이면 resolved, 실패 문구 없으면 기본 문구", () => {
  assert.deepEqual(computeDayVoteResolveAckPatch({ ok: true, outcome: "TIE" }), {
    status: "resolved",
    error: null,
    resolution: { outcome: "TIE", tribunalTargetUuid: null },
  })
  assert.equal(computeDayVoteResolveAckPatch({ ok: false }).error, "판정하지 못했습니다.")
  assert.equal(computeDayVoteResolveAckPatch(undefined).status, "idle")
})

test("낮 투표 판정 무효화: 화면이 내려갔으면 null", () => {
  assert.equal(computeDayVoteResolveInvalidatePatch(false), null)
  assert.deepEqual(computeDayVoteResolveInvalidatePatch(true), { status: "idle", error: null, resolution: null })
})

test("낮 투표 번호: 칸 없으면 빈 조각, 지금 번호는 없으면 1", () => {
  assert.deepEqual(parseDayVoteRoundFields({}), {})
  assert.equal(parseDayVoteRoundFields({ round: "2" }), null)
  assert.equal(getDayVoteRound(null), 1)
  assert.equal(getDayVoteRound({ dayVoteRound: 1 }), 1)
})
