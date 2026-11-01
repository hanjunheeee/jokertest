import { useEffect, useState } from "react"
import {
  INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  INGAME_DAY_TIMEBAR_PHASES,
  INGAME_TIMEBAR_ASSETS,
  INGAME_TIMEBAR_PREVIEW_DAY,
} from "../../constants/timebar/ingameTimebarAssets.js"
import {
  INGAME_TIMEBAR_ARROW_SIZE_CLASS,
  INGAME_TIMEBAR_EXPANDED_ARROW_SIZE_CLASS,
  INGAME_TIMEBAR_COLLAPSE_BTN_LABEL,
  INGAME_TIMEBAR_DAY_LABEL_CLASS,
  INGAME_TIMEBAR_DAY_LABEL_INSET,
  INGAME_TIMEBAR_EXPANDED_DAY_LABEL_CLASS,
  INGAME_TIMEBAR_EXPANDED_DAY_LABEL_INSET,
  INGAME_TIMEBAR_EXPANDED_TRACK_INSET,
  INGAME_TIMEBAR_EXPAND_BTN_CLASS,
  INGAME_TIMEBAR_EXPAND_BTN_IMG_CLASS,
  INGAME_TIMEBAR_EXPAND_BTN_LABEL,
  INGAME_TIMEBAR_NODE_ACTIVE_CLASS,
  INGAME_TIMEBAR_NODE_GAP_CLASS,
  INGAME_TIMEBAR_NODE_SIZE_CLASS,
  INGAME_TIMEBAR_POSITION_CLASS,
  INGAME_TIMEBAR_STACK_CLASS,
  INGAME_TIMEBAR_TRACK_INSET,
  INGAME_TIMEBAR_TRACK_NODES_LAYER_CLASS,
} from "../../constants/timebar/ingameTimebarLayout.js"
import { useInGameTimebarTurnProgress } from "../../hooks/useInGameTimebarTurnProgress.js"
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
        className={`${INGAME_TIMEBAR_NODE_SIZE_CLASS}${
          active ? ` ${INGAME_TIMEBAR_NODE_ACTIVE_CLASS}` : ""
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
        className={`absolute flex items-center justify-between ${INGAME_TIMEBAR_TRACK_NODES_LAYER_CLASS} ${INGAME_TIMEBAR_NODE_GAP_CLASS}`}
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

/**
 * 인게임 우측 상단 시간흐름 바 — 접힘(기본) / 확대(타이머바) 토글.
 * 상태 문구·남은 시간은 호출부가 canonical state에서 파생해 넘긴다.
 */
export default function InGameTimebar({
  day = INGAME_TIMEBAR_PREVIEW_DAY,
  activePhaseId = INGAME_DAY_TIMEBAR_ACTIVE_PHASE,
  statusLabel = null,
  phaseTurnDeadline = null,
  timerPlacement = INGAME_TIMER_PLACEMENT.TIMEBAR,
  remainingRatio: remainingRatioProp,
  remainingSec: remainingSecProp,
  className = INGAME_TIMEBAR_POSITION_CLASS,
}) {
  const [expanded, setExpanded] = useState(false)
  const expandDisabled = timerPlacement === INGAME_TIMER_PLACEMENT.CHAT
  const isExpanded = expandDisabled ? false : expanded

  useEffect(() => {
    if (expandDisabled) setExpanded(false)
  }, [expandDisabled])

  const internalProgress = useInGameTimebarTurnProgress(phaseTurnDeadline)
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
      className={`${className} ${INGAME_TIMEBAR_STACK_CLASS}`.trim()}
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
          dayLabelClass={isExpanded ? INGAME_TIMEBAR_EXPANDED_DAY_LABEL_CLASS : INGAME_TIMEBAR_DAY_LABEL_CLASS}
          dayLabelInset={isExpanded ? INGAME_TIMEBAR_EXPANDED_DAY_LABEL_INSET : INGAME_TIMEBAR_DAY_LABEL_INSET}
          trackInset={isExpanded ? INGAME_TIMEBAR_EXPANDED_TRACK_INSET : INGAME_TIMEBAR_TRACK_INSET}
          arrowSizeClass={
            isExpanded ? INGAME_TIMEBAR_EXPANDED_ARROW_SIZE_CLASS : INGAME_TIMEBAR_ARROW_SIZE_CLASS
          }
        />

        {expandDisabled ? null : (
          <button
            type="button"
            className={INGAME_TIMEBAR_EXPAND_BTN_CLASS}
            aria-label={isExpanded ? INGAME_TIMEBAR_COLLAPSE_BTN_LABEL : INGAME_TIMEBAR_EXPAND_BTN_LABEL}
            aria-expanded={isExpanded}
            data-ingame-timebar-expand=""
            onClick={toggleExpanded}
          >
            <PublicAsset
              src={INGAME_TIMEBAR_ASSETS.expandButton}
              alt=""
              className={INGAME_TIMEBAR_EXPAND_BTN_IMG_CLASS}
            />
          </button>
        )}
      </div>

      <InGamePhaseActionRow />
    </div>
  )
}
