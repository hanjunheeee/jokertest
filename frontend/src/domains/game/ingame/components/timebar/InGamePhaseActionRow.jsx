// 파일 역할: InGamePhaseActionRow.jsx - 시간흐름 바 아래 단계별 행동 버튼 줄입니다.
import { useContext } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import {
  DAY_VOTE_READY_DONE_LABEL,
  DAY_VOTE_READY_LABEL,
  DAY_VOTE_READY_SENDING_LABEL,
  INGAME_ACTION_BUTTON_CLASS,
  INGAME_ACTION_BUTTON_ROW_CLASS,
} from "../../constants/actions/ingameActionPanel.js"

/**
 * V-2: 제어 패널이 사라지면서 갈 곳을 잃은 **대상 없는 행동** 버튼들의 새 자리.
 *
 * 대상을 고르는 행동(낮 투표·밤 행동·재판 표)은 전부 플레이어 카드 좌클릭 메뉴가 맡는다 —
 * 여기 남는 것은 대상이 필요 없는 것뿐이다(준비·기권·집계·판정·건너뛰기·밤 종료).
 *
 * 값을 props로 받지 않고 InGameActionContext를 직접 읽는다. 시간바는 조작 훅과 아무 관계가
 * 없는 표시 전용 컴포넌트라, 그 사이로 열 몇 개의 값을 끼워 흘리면 시간바가 조작 계약을
 * 알아야 하는 자리가 된다. Provider는 InGamePage.jsx의 InGameActionProvider 하나뿐이므로
 * 여기서 읽어도 카드 메뉴와 **같은 훅 인스턴스**를 본다.
 *
 * ctx가 없거나(Provider 밖) 이 단계에 띄울 버튼이 하나도 없으면 줄 자체를 그리지 않는다 —
 * 빈 상자가 시간바 아래 자리를 차지하지 않게 한다.
 */

/** 이 줄 전체. 시간바 스택 안에서 우측 정렬로 붙고, 잠긴 버튼도 눌리는 자리는 유지한다. */
const PHASE_ACTION_ROW_CLASS = `justify-end ${INGAME_ACTION_BUTTON_ROW_CLASS}`

/** 각 버튼을 시험·e2e가 라벨 문구 변화와 무관하게 집을 수 있는 고정 표식. */
export const INGAME_PHASE_ACTION_ATTR = "data-ingame-phase-action"

export const INGAME_PHASE_ACTIONS = Object.freeze({
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  DAY_VOTE_RESOLVE: "dayVoteResolve",
  TRIBUNAL_RESOLVE: "tribunalResolve",
  NIGHT_SKIP: "nightSkip",
  NIGHT_RESOLVE: "nightResolve",
})

/**
 * 이 단계에서 그릴 버튼들. 활성 조건은 전부 기존 제어 패널의 disabled 식을 **뒤집은 그대로**다
 * (승인 계약: 집계·밤 종료에 생존 조건을 새로 붙이지 않는다 — 그 둘은 원래 판정 진행 상태로만
 * 잠겼다).
 */
function buildPhaseActions(ctx) {
  const phase = ctx.gameState?.phase ?? null
  const actions = []

  if (phase === "DAY" && ctx.dayPhase === "DAY_DISCUSSION") {
    actions.push({
      action: INGAME_PHASE_ACTIONS.DAY_READY,
      label: ctx.dayReadyStatus === "sending"
        ? DAY_VOTE_READY_SENDING_LABEL
        : ctx.dayReadyStatus === "ready"
          ? DAY_VOTE_READY_DONE_LABEL
          : DAY_VOTE_READY_LABEL,
      enabled: Boolean(ctx.dayReadyControlsEnabled),
      onClick: ctx.submitDayReady,
    })
  }

  if (phase === "DAY" && ctx.dayPhase === "DAY_VOTE") {
    actions.push({
      action: INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN,
      label: "기권",
      enabled: Boolean(ctx.dayVoteControlsEnabled) && ctx.dayVoteStatus !== "submitting",
      onClick: ctx.abstainDayVote,
    })
    actions.push({
      action: INGAME_PHASE_ACTIONS.DAY_VOTE_RESOLVE,
      label: ctx.dayVoteResolveStatus === "resolving"
        ? "집계 중..."
        : ctx.dayVoteResolveStatus === "resolved"
          ? "집계 완료"
          : "낮 집계",
      enabled: Boolean(ctx.dayVoteResolveControlsEnabled),
      onClick: ctx.resolveDayVote,
    })
  }

  // 재판은 DAY의 하위 구간이 아니라 **별개의 최상위 phase**다.
  if (phase === "TRIBUNAL") {
    actions.push({
      action: INGAME_PHASE_ACTIONS.TRIBUNAL_RESOLVE,
      label: ctx.gameState?.tribunal?.resolved === true
        ? "판정 완료"
        : ctx.tribunalResolveLocked
          ? "판정 중..."
          : "재판 판정",
      enabled: Boolean(ctx.tribunalResolveControlsEnabled),
      onClick: ctx.resolveTribunalVote,
    })
  }

  // 내 역할 턴이 아니면 밤 버튼을 아예 그리지 않는다(잠긴 버튼조차 보이지 않는다).
  if (phase === "NIGHT" && ctx.isNightTurnActor) {
    actions.push({
      action: INGAME_PHASE_ACTIONS.NIGHT_SKIP,
      label: "건너뛰기",
      enabled: ctx.nightActionsLocked !== true && ctx.nightActionStatus !== "submitting",
      onClick: ctx.skipNightAction,
    })
    actions.push({
      action: INGAME_PHASE_ACTIONS.NIGHT_RESOLVE,
      label: ctx.resolveNightStatus === "resolving"
        ? "판정 중..."
        : ctx.resolveNightStatus === "resolved"
          ? "판정 완료"
          : "밤 종료",
      enabled: ctx.resolveNightStatus === "idle",
      onClick: ctx.resolveNight,
    })
  }

  return actions
}

export default function InGamePhaseActionRow() {
  const ctx = useContext(InGameActionContext)
  if (!ctx) return null

  const actions = buildPhaseActions(ctx)
  if (actions.length === 0) return null

  return (
    <div className={PHASE_ACTION_ROW_CLASS} aria-label="단계 행동">
      {actions.map((entry) => (
        <button
          key={entry.action}
          type="button"
          {...{ [INGAME_PHASE_ACTION_ATTR]: entry.action }}
          className={INGAME_ACTION_BUTTON_CLASS}
          disabled={!entry.enabled}
          onClick={entry.onClick}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}
