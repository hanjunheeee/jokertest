// 사망 뒤 선택 창: 계속 보기·나가기와 나가기 진행 안내
// 인게임 화면이 사용, 초점은 창 안으로 옮기고 가둠 (Esc로는 안 닫힘: 꼭 골라야 함)
import { useRef } from "react"
import { useInGameModalLayer } from "../../hooks/useInGameModalLayer.js"

const OVERLAY_CLASS =
  "absolute inset-0 z-[68] flex items-center justify-center bg-black/70 px-6"

const PANEL_CLASS =
  "flex w-[min(28rem,92vw)] flex-col items-center gap-4 rounded-2xl bg-neutral-900/95 px-8 py-7 text-center text-white shadow-2xl"

const BUTTON_ROW_CLASS = "mt-1 flex w-full flex-col gap-2 sm:flex-row"

const BUTTON_BASE_CLASS =
  "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"

const PRIMARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-amber-500/90 text-black hover:bg-amber-400`

const SECONDARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-neutral-700 text-white hover:bg-neutral-600`

function exitNotice(exitStatus, exitErrorCode) {
  if (exitStatus === "pending") return "나가는 중입니다…"
  if (exitStatus === "failed") {
    if (exitErrorCode === "OFFLINE") return "연결이 끊겨 나가기를 보내지 못했습니다. 다시 시도해 주세요."
    if (exitErrorCode === "STILL_PARTICIPATING") return "아직 이 게임에 남아 있습니다. 다시 시도해 주세요."
    return "나가기에 실패했습니다. 다시 시도해 주세요."
  }
  if (exitStatus === "unresolved") {
    return "나가기 결과를 확인하지 못했습니다. 결과 확인 후 다시 시도할 수 있습니다."
  }
  return null
}

export default function InGameDeadParticipantChoice({ open, ...props }) {
  if (!open) return null
  return <DeadParticipantChoicePanel {...props} />
}

function DeadParticipantChoicePanel({
  onKeepWatching,
  onLeave,
  onRetry,
  onResolveOutcome,
  exitStatus = "idle",
  exitErrorCode = null,
}) {
  const dialogRef = useRef(null)
  useInGameModalLayer({ open: true, containerRef: dialogRef })

  const notice = exitNotice(exitStatus, exitErrorCode)
  const busy = exitStatus === "pending"

  return (
    <div ref={dialogRef} tabIndex={-1} className={OVERLAY_CLASS} role="dialog" aria-modal="true" aria-label="사망 후 선택">
      <div className={PANEL_CLASS}>
        <span className="text-lg font-bold">당신은 사망했습니다.</span>
        <span className="text-sm text-neutral-300">
          남은 경기를 계속 지켜보거나, 지금 게임에서 나갈 수 있습니다.
        </span>

        {notice ? (
          <span role="status" className="text-sm text-amber-300">{notice}</span>
        ) : null}

        <div className={BUTTON_ROW_CLASS}>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={onKeepWatching}
            disabled={busy}
          >
            관전 계속하기
          </button>
          <button
            type="button"
            data-sfx-owner="explicit"
            className={SECONDARY_BUTTON_CLASS}
            onClick={onLeave}
            disabled={busy}
          >
            게임 나가기
          </button>
        </div>

        {exitStatus === "failed" ? (
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onRetry}>
            다시 시도
          </button>
        ) : null}
        {exitStatus === "unresolved" ? (
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onResolveOutcome}>
            나가기 결과 확인
          </button>
        ) : null}
      </div>
    </div>
  )
}
