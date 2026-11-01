// 사망 후 선택 창: 관전 계속하기·게임 나가기, 나가기 실패·결과 모름이면 다시 시도·결과 확인
// OverlayLayer가 씀, 열림·선택은 useDeadChoice (나가기는 화면 틀의 useInGameExit 손잡이)
const BTN_BASE_CLASS =
    "min-h-11 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"

const PRIMARY_BTN_CLASS = `${BTN_BASE_CLASS} bg-amber-500/90 text-black active:bg-amber-400`

const SECONDARY_BTN_CLASS = `${BTN_BASE_CLASS} bg-neutral-700 text-white active:bg-neutral-600`

// 나가기 상태별 안내 글 (데스크톱과 같은 글)
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

// 폰에선 버튼을 위아래로 쌓고 가로 폰·태블릿에선 나란히
export default function DeadChoiceOverlay({
    open,
    keepWatching,
    leave,
    retry,
    resolveOutcome,
    exitStatus = "idle",
    exitErrorCode = null,
}) {
    if (!open) return null

    const notice = exitNotice(exitStatus, exitErrorCode)
    const busy = exitStatus === "pending"

    return (
        <div
            className="fixed inset-0 z-[68] flex items-center justify-center bg-black/70 px-4 safe-pt safe-pb"
            role="dialog"
            aria-modal="true"
            aria-label="사망 후 선택"
        >
            <div className="flex w-full max-w-[26rem] flex-col items-center gap-3 rounded-2xl bg-neutral-900/95 px-5 py-6 text-center text-white shadow-2xl land:py-4">
                <span className="text-lg font-bold">당신은 사망했습니다.</span>
                <span className="text-sm text-neutral-300 [word-break:keep-all]">
                    남은 경기를 계속 지켜보거나, 지금 게임에서 나갈 수 있습니다.
                </span>

                {notice ? <span role="status" className="text-sm text-amber-300">{notice}</span> : null}

                <div className="mt-1 flex w-full flex-col gap-2 md:flex-row land:flex-row">
                    <button type="button" className={PRIMARY_BTN_CLASS} onClick={keepWatching} disabled={busy}>
                        관전 계속하기
                    </button>
                    <button
                        type="button"
                        data-sfx-owner="explicit"
                        className={SECONDARY_BTN_CLASS}
                        onClick={() => leave?.()}
                        disabled={busy || !leave}
                    >
                        게임 나가기
                    </button>
                </div>

                {exitStatus === "failed" && retry ? (
                    <button type="button" className={SECONDARY_BTN_CLASS} onClick={retry}>다시 시도</button>
                ) : null}
                {exitStatus === "unresolved" && resolveOutcome ? (
                    <button type="button" className={SECONDARY_BTN_CLASS} onClick={resolveOutcome}>나가기 결과 확인</button>
                ) : null}
            </div>
        </div>
    )
}
