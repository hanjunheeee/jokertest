import { useContext } from "react"
import { InGameActionContext } from "../../context/InGameActionContext.jsx"
import { INGAME_CORNER_ACTION_ASSETS } from "../../constants/actions/ingameCornerActionAssets.js"
import { INGAME_CORNER_ACTION_PANEL_CLASS } from "../../constants/actions/ingameCornerActionLayout.js"
import InGameImageActionButton from "./InGameImageActionButton.jsx"
import InGameVoteToggleButton from "../vote/InGameVoteToggleButton.jsx"
import {
  INGAME_CORNER_VOTE_TOGGLE_BTN_CLASS,
  INGAME_CORNER_VOTE_TOGGLE_BTN_IMG_CLASS,
  INGAME_CORNER_VOTE_TOGGLE_BTN_LABEL_CLASS,
  INGAME_CORNER_VOTE_TOGGLE_WRAP_CLASS,
} from "../../constants/actions/ingameCornerActionLayout.js"
import { INGAME_PHASE_ACTION_ATTR } from "../timebar/InGamePhaseActionRow.jsx"

/**
 * V-2: timebar 아래에 있던 투표 현황·기권·건너뛰기를 화면 우측 하단으로 옮긴다.
 *
 * 낮 집계·밤 종료 등 나머지 대상 없는 행동은 InGamePhaseActionRow(시간bar 아래)에 남는다.
 */
export default function InGameCornerActionPanel({ onVoteStatusClick }) {
  const ctx = useContext(InGameActionContext)
  if (!ctx) return null

  const phase = ctx.gameState?.phase ?? null
  const showVoteStatus = typeof onVoteStatusClick === "function"
  const showAbstain = phase === "DAY" && ctx.dayPhase === "DAY_VOTE"
  const showSkip = phase === "NIGHT" && ctx.isNightTurnActor

  if (!showVoteStatus && !showAbstain && !showSkip) return null

  return (
    <div className={INGAME_CORNER_ACTION_PANEL_CLASS} aria-label="투표·행동">
      {showVoteStatus ? (
        <InGameVoteToggleButton
          onClick={onVoteStatusClick}
          className={INGAME_CORNER_VOTE_TOGGLE_WRAP_CLASS}
          buttonClassName={INGAME_CORNER_VOTE_TOGGLE_BTN_CLASS}
          imgClassName={INGAME_CORNER_VOTE_TOGGLE_BTN_IMG_CLASS}
          labelClassName={INGAME_CORNER_VOTE_TOGGLE_BTN_LABEL_CLASS}
        />
      ) : null}
      {showAbstain ? (
        <InGameImageActionButton
          {...{ [INGAME_PHASE_ACTION_ATTR]: "dayVoteAbstain" }}
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
          {...{ [INGAME_PHASE_ACTION_ATTR]: "nightSkip" }}
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
