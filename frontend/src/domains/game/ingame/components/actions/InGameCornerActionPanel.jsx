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

export default function InGameCornerActionPanel({ onVoteStatusClick }) {
  const ctx = useContext(InGameActionContext)
  if (!ctx) return null

  const phase = ctx.gameState?.phase ?? null
  const showVoteStatus = typeof onVoteStatusClick === "function"
  const showAbstain = phase === "DAY" && ctx.dayPhase === "DAY_VOTE"
  const showSkip = phase === "NIGHT" && ctx.isNightTurnActor

  if (!showVoteStatus && !showAbstain && !showSkip) return null

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
