/**
 * F-23(AC-06): 확정 사망한 **참가자**에게 "관전 계속하기 / 게임 나가기"를 묻는 오버레이.
 *
 * 이것은 외부 관전자 기능이 아니다 — 계속 보기를 골라도 서버에 아무 요청도 보내지 않고,
 * 소속·역할·채널 가입은 그대로다(A-04). 바뀌는 것은 이 화면이 선택창을 접는다는 사실뿐이고,
 * 이후에도 상단 "게임 나가기" 버튼으로 언제든 같은 이탈 경로를 쓸 수 있다.
 *
 * 나가기의 진행 상태(pending·실패·결과 미확정)는 전부 useInGameExit이 소유한다. 이 컴포넌트는
 * 그 값을 그리기만 하고 스스로 성공을 단정하지 않는다 — 미확정에서 로비로 보내지 않는다.
 *
 * z 단계는 사망 연출(z-[70]/[71])보다 아래, 진입 연출·역할 턴 안내(z-[60]/[61])보다 위다 —
 * 자기 사망 연출이 재생되는 동안에는 그 위를 덮지 않고, 연출이 끝난 뒤 선택을 받는다.
 */

const OVERLAY_CLASS =
  "absolute inset-0 z-[68] flex items-center justify-center bg-black/70 px-6"

const PANEL_CLASS =
  "flex w-[min(28rem,92vw)] flex-col items-center gap-4 rounded-2xl bg-neutral-900/95 px-8 py-7 text-center text-white shadow-2xl"

const BUTTON_ROW_CLASS = "mt-1 flex w-full flex-col gap-2 sm:flex-row"

const BUTTON_BASE_CLASS =
  "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"

const PRIMARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-amber-500/90 text-black hover:bg-amber-400`

const SECONDARY_BUTTON_CLASS = `${BUTTON_BASE_CLASS} bg-neutral-700 text-white hover:bg-neutral-600`

/** 나가기 상태별 안내 문구. 미확정은 "실패"가 아니라 "확인 필요"로 말한다. */
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

export default function InGameDeadParticipantChoice({
  open,
  onKeepWatching,
  onLeave,
  onRetry,
  onResolveOutcome,
  exitStatus = "idle",
  exitErrorCode = null,
}) {
  if (!open) return null

  const notice = exitNotice(exitStatus, exitErrorCode)
  const busy = exitStatus === "pending"

  return (
    <div className={OVERLAY_CLASS} role="dialog" aria-modal="true" aria-label="사망 후 선택">
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

        {/* 실패·미확정에서만 열리는 복구 수단. 미확정은 "다시 보내기"가 아니라 **권위 있는
            확인**이 먼저다 — 서버가 이미 커밋했을 수 있으므로 무턱대고 다시 보내지 않는다. */}
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
