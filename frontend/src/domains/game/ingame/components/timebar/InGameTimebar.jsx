// 위쪽 시간 바 (낮 단계·남은 시간)
// InGamePage가 씀
import {
  DAY_TIMEBAR_ACTIVE_PHASE,
  INGAME_DAY_TIMEBAR_PHASES,
  INGAME_TIMEBAR_ASSETS,
  PREVIEW_DAY,
} from "../../constants/timebar/ingameTimebarAssets.js"
import {
  ARROW_SIZE_CLASS,
  DAY_LABEL_CLASS,
  DAY_LABEL_INSET,
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
  showResourcesWithoutLabel = false,
}) {
  // 바깥에서 진행 값을 받으면 안에서 또 세지 않음
  const ownsProgress = remainingRatioProp === undefined && remainingSecProp === undefined
  const internalProgress = useTurnProgress(ownsProgress ? phaseTurnDeadline : null)
  const remainingRatio = remainingRatioProp ?? internalProgress.remainingRatio
  const remainingSec = remainingSecProp ?? internalProgress.remainingSec
  const hasStatusLabel = typeof statusLabel === "string" && statusLabel.length > 0
  const showTimerOnTimebar =
    timerPlacement === INGAME_TIMER_PLACEMENT.TIMEBAR
    && (hasStatusLabel || showResourcesWithoutLabel)

  const dayLabel = `제 ${day}일`

  return (
    <div
      className={`${className} ${STACK_CLASS} overflow-visible`.trim()}
      aria-label={`${dayLabel} 시간 흐름`}
    >
      <div className="relative w-full overflow-visible leading-none">
        {showTimerOnTimebar ? (
          <InGamePhaseTurnTimerPanel
            statusLabel={statusLabel}
            remainingRatio={remainingRatio}
            remainingSec={remainingSec}
            placement={INGAME_TIMER_PLACEMENT.TIMEBAR}
            embeddedLayout="timebar"
            showResourcesWithoutLabel={showResourcesWithoutLabel}
          />
        ) : null}

        <PublicAsset
          src={INGAME_TIMEBAR_ASSETS.frame}
          alt=""
          className="block h-auto w-full select-none"
          aria-hidden="true"
        />

        <TimebarTrack
          activePhaseId={activePhaseId}
          dayLabel={dayLabel}
          dayLabelClass={DAY_LABEL_CLASS}
          dayLabelInset={DAY_LABEL_INSET}
          trackInset={TRACK_INSET}
          arrowSizeClass={ARROW_SIZE_CLASS}
        />
      </div>

      <InGamePhaseActionRow />
    </div>
  )
}