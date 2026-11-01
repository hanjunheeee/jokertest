import { useEffect, useState } from "react"
import {
  DAY_TIMEBAR_ACTIVE_PHASE,
  INGAME_DAY_TIMEBAR_PHASES,
  INGAME_TIMEBAR_ASSETS,
  PREVIEW_DAY,
} from "../../constants/timebar/ingameTimebarAssets.js"
import {
  ARROW_SIZE_CLASS,
  COLLAPSE_BTN_LABEL,
  DAY_LABEL_CLASS,
  DAY_LABEL_INSET,
  EXPANDED_ARROW_SIZE_CLASS,
  EXPANDED_DAY_LABEL_CLASS,
  EXPANDED_DAY_LABEL_INSET,
  EXPANDED_TRACK_INSET,
  EXPAND_BTN_IMG_CLASS,
  EXPAND_BTN_LABEL,
  INGAME_TIMEBAR_EXPAND_BTN_CLASS,
  NODE_ACTIVE_CLASS,
  NODE_GAP_CLASS,
  NODE_SIZE_CLASS,
  POSITION_CLASS,
  STACK_CLASS,
  TRACK_INSET,
  TRACK_NODES_LAYER_CLASS,
} from "../../constants/timebar/ingameTimebarLayout.js"
import { useTurnProgress } from "../../hooks/timebar/useTurnProgress.js"
import InGamePhaseActionRow from "./InGamePhaseActionRow.jsx"
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"
import InGamePhaseTurnTimerPanel from "./InGamePhaseTurnTimerPanel.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

function TimebarNode({ src, active, arrowSizeClass }) {
  return (
    <div className="relative flex shrink-0 items-center justify-center">
      {active ? (
        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.indicatorArrow}
          alt=""
          aria-hidden="true"
          className={arrowSizeClass}
        />
      ) : null}
      <PublicAsset
        src={src}
        alt=""
        aria-hidden="true"
        className={`${NODE_SIZE_CLASS}${
          active ? ` ${NODE_ACTIVE_CLASS}` : ""
        }`}
      />
    </div>
  )
}

function TimebarTrack({
  activePhaseId,
  dayLabel,
  dayLabelClass,
  dayLabelInset,
  trackInset,
  arrowSizeClass,
}) {
  return (
    <>
      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={dayLabelInset}
      >
        <span className={dayLabelClass}>{dayLabel}</span>
      </div>

      <div
        className={`absolute flex items-center justify-between ${TRACK_NODES_LAYER_CLASS} ${NODE_GAP_CLASS}`}
        style={trackInset}
        aria-hidden="true"
      >
        {INGAME_DAY_TIMEBAR_PHASES.map((phase) => (
          <TimebarNode
            key={phase.id}
            src={phase.src}
            active={phase.id === activePhaseId}
            arrowSizeClass={arrowSizeClass}
          />
        ))}
      </div>
    </>
  )
}

export default function InGameTimebar({
  day = PREVIEW_DAY,
  activePhaseId = DAY_TIMEBAR_ACTIVE_PHASE,
  statusLabel = null,
  phaseTurnDeadline = null,
  timerPlacement = INGAME_TIMER_PLACEMENT.TIMEBAR,
  remainingRatio: remainingRatioProp,
  remainingSec: remainingSecProp,
  className = POSITION_CLASS,
}) {
  const [expanded, setExpanded] = useState(false)
  const expandDisabled = timerPlacement === INGAME_TIMER_PLACEMENT.CHAT
  const isExpanded = expandDisabled ? false : expanded

  useEffect(() => {
    if (expandDisabled) setExpanded(false)
  }, [expandDisabled])

  const internalProgress = useTurnProgress(phaseTurnDeadline)
  const remainingRatio = remainingRatioProp ?? internalProgress.remainingRatio
  const remainingSec = remainingSecProp ?? internalProgress.remainingSec
  const showTimerOnTimebar =
    timerPlacement === INGAME_TIMER_PLACEMENT.TIMEBAR && isExpanded && statusLabel

  const dayLabel = `제 ${day}일`
  const toggleExpanded = () => {
    if (expandDisabled) return
    setExpanded((current) => !current)
  }

  return (
    <div
      className={`${className} ${STACK_CLASS}`.trim()}
      aria-label={`${dayLabel} 시간 흐름`}
    >
      <div className="relative w-full leading-none">
        {showTimerOnTimebar ? (
          <InGamePhaseTurnTimerPanel
            statusLabel={statusLabel}
            remainingRatio={remainingRatio}
            remainingSec={remainingSec}
            placement={INGAME_TIMER_PLACEMENT.TIMEBAR}
          />
        ) : null}

        <PublicAsset
          src={isExpanded ? INGAME_TIMEBAR_ASSETS.frameExpanded : INGAME_TIMEBAR_ASSETS.frame}
          alt=""
          className="block h-auto w-full select-none"
          aria-hidden="true"
        />

        <TimebarTrack
          activePhaseId={activePhaseId}
          dayLabel={dayLabel}
          dayLabelClass={isExpanded ? EXPANDED_DAY_LABEL_CLASS : DAY_LABEL_CLASS}
          dayLabelInset={isExpanded ? EXPANDED_DAY_LABEL_INSET : DAY_LABEL_INSET}
          trackInset={isExpanded ? EXPANDED_TRACK_INSET : TRACK_INSET}
          arrowSizeClass={isExpanded ? EXPANDED_ARROW_SIZE_CLASS : ARROW_SIZE_CLASS}
        />

        {expandDisabled ? null : (
          <button
            type="button"
            className={INGAME_TIMEBAR_EXPAND_BTN_CLASS}
            aria-label={isExpanded ? COLLAPSE_BTN_LABEL : EXPAND_BTN_LABEL}
            aria-expanded={isExpanded}
            data-ingame-timebar-expand=""
            onClick={toggleExpanded}
          >
            <PublicAsset
              src={INGAME_TIMEBAR_ASSETS.expandButton}
              alt=""
              className={EXPAND_BTN_IMG_CLASS}
            />
          </button>
        )}
      </div>

      <InGamePhaseActionRow />
    </div>
  )
}
