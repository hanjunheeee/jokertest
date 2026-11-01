// 구석 행동 패널: 투표 현황 열기·낮 투표 기권·밤 건너뛰기 그림 버튼
// 인게임 화면이 사용, 버튼 상태·동작은 조작 컨텍스트(InGameActionContext)에서 꺼냄
import { useContext } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import { INGAME_CORNER_ACTION_ASSETS } from "../../constants/actions/ingameCornerActionAssets.js"
import { PANEL_CLASS } from "../../constants/actions/ingameCornerActionLayout.js"
import InGameImageActionButton from "./InGameImageActionButton.jsx"
import InGameVoteToggleButton from "../vote/InGameVoteToggleButton.jsx"
import {
  VOTE_TOGGLE_BTN_CLASS,
  VOTE_TOGGLE_BTN_IMG_CLASS,
  VOTE_TOGGLE_BTN_LABEL_CLASS,
  VOTE_TOGGLE_WRAP_CLASS,
} from "../../constants/actions/ingameCornerActionLayout.js"
import { PHASE_ACTION_ATTR } from "../timebar/InGamePhaseActionRow.jsx"

// 단계에 맞는 버튼만 보이고, 보일 게 없으면 패널째 안 그림
export default function InGameCornerActionPanel({ onVoteStatusClick }) {
  const ctx = useContext(InGameActionContext)
  // 조작 Provider 밖이면 안 그림
  if (!ctx) return null

  const phase = ctx.gameState?.phase ?? null
  // 투표 현황은 여는 함수 받았을 때만
  const showVoteStatus = typeof onVoteStatusClick === "function"
  // 기권은 낮 투표 중, 건너뛰기는 내 밤 차례일 때만
  const showAbstain = phase === "DAY" && ctx.dayPhase === "DAY_VOTE"
  const showSkip = phase === "NIGHT" && ctx.isNightTurnActor

  // 보일 버튼 하나도 없으면 빈 패널 안 남김
  if (!showVoteStatus && !showAbstain && !showSkip) return null

  // 이미 냈거나 보내는 중·잠김이면 기권·건너뛰기 막기
  // 두 버튼엔 단계 행동 표시(PHASE_ACTION_ATTR)를 달아 시험이 찾음
  return (
    <div className={PANEL_CLASS} aria-label="투표·행동">
      {showVoteStatus ? (
        <InGameVoteToggleButton
          onClick={onVoteStatusClick}
          className={VOTE_TOGGLE_WRAP_CLASS}
          buttonClassName={VOTE_TOGGLE_BTN_CLASS}
          imgClassName={VOTE_TOGGLE_BTN_IMG_CLASS}
          labelClassName={VOTE_TOGGLE_BTN_LABEL_CLASS}
        />
      ) : null}
      {showAbstain ? (
        <InGameImageActionButton
          {...{ [PHASE_ACTION_ATTR]: "dayVoteAbstain" }}
          src={INGAME_CORNER_ACTION_ASSETS.abstain}
          label="기권"
          disabled={
            !ctx.dayVoteControlsEnabled
            || ctx.dayVoteStatus === "submitting"
            || ctx.dayVoteHasSubmitted === true
          }
          onClick={ctx.abstainDayVote}
        />
      ) : null}
      {showSkip ? (
        <InGameImageActionButton
          {...{ [PHASE_ACTION_ATTR]: "nightSkip" }}
          src={INGAME_CORNER_ACTION_ASSETS.skip}
          label="건너뛰기"
          disabled={
            ctx.nightActionsLocked === true
            || ctx.nightActionStatus === "submitting"
            || ctx.nightActionHasSubmitted === true
          }
          onClick={ctx.skipNightAction}
        />
      ) : null}
    </div>
  )
}
