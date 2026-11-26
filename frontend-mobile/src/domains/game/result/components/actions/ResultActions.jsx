// 결과 화면 바닥 고정 단추 줄: 떠나기 실패 안내 배너 + "대기방으로"·"로비로" (결과 없으면 "로비로 돌아가기" 하나)
// pages/GameResultPage가 사용, ShellBottom 안에 세로로 배치해 안내가 단추를 절대 가리지 않게 함
import { motion } from "framer-motion"
import { GAME_RESULT_ASSETS } from "@/domains/game/result/constants/gameResultAssets.js"
import { LOBBY_BTN_REVEAL_DELAY } from "@/domains/game/result/constants/gameResultEntranceMotion.js"
import {
    GAME_RESULT_LOBBY_BUTTON_LABEL,
    GAME_RESULT_MATCHING_BUTTON_LABEL,
    GAME_RESULT_MATCHING_PENDING_LABEL,
} from "@/domains/game/result/constants/gameResultLabels.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 틀 그림 단추 모양 (잠기면 반투명·클릭 막기 적용)
const FRAME_LOOK = {
    button: "relative flex h-13 min-w-0 flex-1 cursor-pointer items-center justify-center transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 land:h-11 md:h-14",
    img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
    label: "relative truncate px-3 font-subheading text-lg font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
}

const WRAP_CLASS =
    "mx-auto flex w-full max-w-[30rem] flex-col gap-1.5 px-4 pt-1.5 pb-2.5 land:max-w-[26rem] land:pt-1 land:pb-1.5 md:max-w-[34rem]"

const LEAVE_NOTICE_CLASS =
    "w-full rounded-sm border border-[#c87878]/75 bg-[#2a1212]/95 px-3 py-2 text-center font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold leading-snug text-[#ffd8cc]"

const PLAIN_BTN_CLASS =
    "mx-auto min-h-11 px-4 font-subheading text-base font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// 바닥 단추 줄과 떠나기 실패 인라인 안내 표시
export default function ResultActions({
    hasResult,
    isReturning = false,
    isExitPending = false,
    leaveNotice = null,
    noticeSource = null,
    onReturnToMatching,
    onExitToLobby,
    onLeaveUnavailable,
}) {
    const locked = Boolean(isReturning || isExitPending)
    const returnLabel = isReturning ? GAME_RESULT_MATCHING_PENDING_LABEL : GAME_RESULT_MATCHING_BUTTON_LABEL

    return (
        <ShellBottom>
            <div className={WRAP_CLASS}>
                {hasResult && leaveNotice ? (
                    <p
                        role="alert"
                        className={LEAVE_NOTICE_CLASS}
                        data-testid="result-leave-notice"
                        data-notice-source={noticeSource ?? undefined}
                    >
                        {leaveNotice}
                    </p>
                ) : null}
                <motion.div
                    className="flex w-full items-center gap-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...UI_REVEAL_TRANSITION, delay: LOBBY_BTN_REVEAL_DELAY }}
                >
                    {hasResult ? (
                        <>
                            <ImageButton
                                look={FRAME_LOOK}
                                src={GAME_RESULT_ASSETS.matchingButton}
                                label={returnLabel}
                                ariaLabel={returnLabel}
                                onClick={onReturnToMatching}
                                disabled={locked}
                                busy={isReturning}
                            />
                            <ImageButton
                                look={FRAME_LOOK}
                                src={GAME_RESULT_ASSETS.lobbyButton}
                                label={GAME_RESULT_LOBBY_BUTTON_LABEL}
                                ariaLabel={GAME_RESULT_LOBBY_BUTTON_LABEL}
                                onClick={onExitToLobby}
                                disabled={locked}
                            />
                        </>
                    ) : (
                        <button type="button" className={PLAIN_BTN_CLASS} onClick={onLeaveUnavailable}>
                            로비로 돌아가기
                        </button>
                    )}
                </motion.div>
            </div>
        </ShellBottom>
    )
}
