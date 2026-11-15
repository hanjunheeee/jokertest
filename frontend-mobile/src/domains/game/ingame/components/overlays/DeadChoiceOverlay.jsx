// 사망 후 선택 창: 관전 계속하기·게임 나가기(벌 없음 안내), 나가기 실패·결과 모름이면 다시 시도·결과 확인
// OverlayLayer가 씀, 열림·선택은 useDeadChoice (나가기는 화면 틀의 useInGameExit 손잡이), 글·색은 데스크톱과 같음 (상태 안내 글은 데스크톱 exitConfirm.js에서 같이 씀)
import { useDialogFocus } from "@m/shared/hooks/useDialogFocus.js"
import { selectExitStatusNotice } from "@/domains/game/ingame/utils/exitConfirm.js"

const PANEL_CLASS =
    "flex w-[min(28rem,92vw)] flex-col items-center gap-4 rounded-2xl bg-neutral-900/95 px-8 py-7 text-center text-white shadow-2xl land:gap-3 land:py-5"

// 좁은 폰은 위아래, 640px 넘으면 나란히 (데스크톱 sm:flex-row)
const BUTTON_ROW_CLASS = "mt-1 flex w-full flex-col gap-2 sm:flex-row"

const BTN_BASE_CLASS =
    "min-h-11 flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"

const PRIMARY_BTN_CLASS = `${BTN_BASE_CLASS} bg-amber-500/90 text-black active:bg-amber-400`

const SECONDARY_BTN_CLASS = `${BTN_BASE_CLASS} bg-neutral-700 text-white active:bg-neutral-600`

// 버튼 글·순서·막힘 조건은 데스크톱과 같음 (나가기 손잡이 못 받았으면 나가기만 막음)
export default function DeadChoiceOverlay({
    open,
    keepWatching,
    leave,
    retry,
    resolveOutcome,
    exitStatus = "idle",
    exitErrorCode = null,
}) {
    const focusRef = useDialogFocus()
    if (!open) return null

    const notice = selectExitStatusNotice(exitStatus, exitErrorCode)
    const busy = exitStatus === "pending"

    return (
        <div
            className="fixed inset-0 z-[68] flex items-center justify-center bg-black/70 px-6 safe-pt safe-pb"
            ref={focusRef}
            role="dialog"
            aria-modal="true"
            aria-label="사망 후 선택"
        >
            <div className={PANEL_CLASS}>
                <span className="text-lg font-bold">당신은 사망했습니다.</span>
                <span className="text-sm text-neutral-300">
                    남은 경기를 계속 지켜보거나, 지금 게임에서 나갈 수 있습니다.
                </span>
                {/* 벌 없음 안내는 사망으로 열렸을 때만 (산 사람 나가기 실패로도 이 창이 열려서) */}
                {exitStatus === "idle" ? (
                    <span className="text-sm text-neutral-300">
                        사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다.
                    </span>
                ) : null}

                {notice ? <span role="status" className="text-sm text-amber-300">{notice}</span> : null}

                <div className={BUTTON_ROW_CLASS}>
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

                {exitStatus === "failed" ? (
                    <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => retry?.()}>다시 시도</button>
                ) : null}
                {exitStatus === "unresolved" ? (
                    <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => resolveOutcome?.()}>
                        나가기 결과 확인
                    </button>
                ) : null}
            </div>
        </div>
    )
}
