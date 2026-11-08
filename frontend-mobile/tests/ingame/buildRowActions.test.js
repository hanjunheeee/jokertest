// 행동 줄 버튼 목록(구석 패널·단계 행동 줄) 시험
import "../helpers/mobileLoader.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

const { ROW_ACTIONS, buildCornerActions, buildPhaseActions } = await import("@m/domains/game/ingame/hooks/actions/buildRowActions.js")

const noop = () => {}
const day = (dayPhase, extra = {}) => ({ gameState: { phase: "DAY" }, dayPhase, ...extra })
const night = (extra = {}) => ({ gameState: { phase: "NIGHT" }, ...extra })
const view = (actions) => actions.map(({ action, label, enabled, kind }) => ({ action, label, enabled, kind }))

test("구석 패널: 단계 없으면 투표 현황 하나만, 누르면 넘긴 함수", () => {
    const open = () => "열림"
    const actions = buildCornerActions({}, open)
    assert.deepEqual(view(actions), [{ action: null, label: "투표 현황", enabled: true, kind: "voteStatus" }])
    assert.equal(actions[0].onClick, open)
})

test("낮 투표: 기권 켜짐, 이미 냈거나 보내는 중·조작 꺼짐이면 꺼짐", () => {
    const on = buildCornerActions(day("DAY_VOTE", { dayVoteControlsEnabled: true, abstainDayVote: noop }), noop)
    assert.deepEqual(view(on)[1], { action: ROW_ACTIONS.DAY_VOTE_ABSTAIN, label: "기권", enabled: true, kind: "abstain" })
    for (const extra of [{ dayVoteHasSubmitted: true }, { dayVoteStatus: "submitting" }, { dayVoteControlsEnabled: false }]) {
        const actions = buildCornerActions(day("DAY_VOTE", { dayVoteControlsEnabled: true, ...extra }), noop)
        assert.equal(actions[1].enabled, false, JSON.stringify(extra))
    }
})

test("낮 토론엔 기권 없음", () => {
    assert.equal(buildCornerActions(day("DAY_DISCUSSION", { dayVoteControlsEnabled: true }), noop).length, 1)
})

test("밤: 내 차례일 때만 건너뛰기, 잠김·보내는 중·냈으면 꺼짐", () => {
    assert.equal(buildCornerActions(night({ isNightTurnActor: false }), noop).length, 1)
    const mine = buildCornerActions(night({ isNightTurnActor: true }), noop)
    assert.deepEqual(view(mine)[1], { action: ROW_ACTIONS.NIGHT_SKIP, label: "건너뛰기", enabled: true, kind: "skip" })
    for (const extra of [{ nightActionsLocked: true }, { nightActionStatus: "submitting" }, { nightActionHasSubmitted: true }]) {
        assert.equal(buildCornerActions(night({ isNightTurnActor: true, ...extra }), noop)[1].enabled, false)
    }
})

test("낮 토론 행동 줄: 준비 글자가 보내는 중·완료에 따라 바뀜", () => {
    const label = (dayReadyStatus) => buildPhaseActions(day("DAY_DISCUSSION", { dayReadyStatus, dayReadyControlsEnabled: true }))[0].label
    assert.equal(label(undefined), "투표 시작 준비")
    assert.equal(label("sending"), "준비 중...")
    assert.equal(label("ready"), "준비 완료")
    assert.equal(buildPhaseActions(day("DAY_DISCUSSION"))[0].enabled, false)
})

test("낮 투표 행동 줄: 집계 글자, 모르는 상태는 낮 집계", () => {
    const at = (s) => buildPhaseActions(day("DAY_VOTE", { dayVoteResolveStatus: s }))[0]
    assert.equal(at("resolving").label, "집계 중...")
    assert.equal(at("resolved").label, "집계 완료")
    assert.equal(at("이상한값").label, "낮 집계")
    assert.equal(at("idle").action, ROW_ACTIONS.DAY_VOTE_RESOLVE)
})

test("재판 행동 줄: 판정 끝·판정 중·기본 글자", () => {
    const at = (tribunal, extra = {}) => buildPhaseActions({ gameState: { phase: "TRIBUNAL", tribunal }, ...extra })[0].label
    assert.equal(at({ resolved: true }), "판정 완료")
    assert.equal(at({}, { tribunalResolveLocked: true }), "판정 중...")
    assert.equal(at(undefined), "재판 판정")
})

test("밤 행동 줄: 내 차례만, idle일 때만 켜짐", () => {
    assert.deepEqual(buildPhaseActions(night({ isNightTurnActor: false })), [])
    const idle = buildPhaseActions(night({ isNightTurnActor: true, resolveNightStatus: "idle" }))[0]
    assert.deepEqual({ label: idle.label, enabled: idle.enabled }, { label: "밤 종료", enabled: true })
    const busy = buildPhaseActions(night({ isNightTurnActor: true, resolveNightStatus: "resolving" }))[0]
    assert.deepEqual({ label: busy.label, enabled: busy.enabled }, { label: "판정 중...", enabled: false })
})

test("행동 표시 값 이름이 데스크톱과 같고 바꿀 수 없음", () => {
    assert.equal(ROW_ACTIONS.DAY_READY, "dayReady")
    assert.equal(ROW_ACTIONS.NIGHT_RESOLVE, "nightResolve")
    assert.ok(Object.isFrozen(ROW_ACTIONS))
})

test("낮 투표 행동 줄에 재투표 버튼 없음(낮 집계 하나만)", () => {
    const actions = buildPhaseActions(day("DAY_VOTE", { dayVoteResolveStatus: "resolved" }))
    assert.equal(actions.length, 1)
    assert.ok(actions.every((a) => !/재투표/.test(a.label)))
})
