// 결과 화면 바닥 고정 버튼 줄: "대기방으로"·"로비로" (결과 없으면 "로비로 돌아가기" 하나)
// pages/GameResultPage가 씀, 화면 틀 바닥 자리(ShellBottom)에 그림
import { motion } from "framer-motion"
import { GAME_RESULT_ASSETS } from "@/domains/game/result/constants/gameResultAssets.js"
import { LOBBY_BTN_REVEAL_DELAY } from "@/domains/game/result/constants/gameResultEntranceMotion.js"
import {
    GAME_RESULT_LOBBY_BUTTON_LABEL,
    GAME_RESULT_MATCHING_BUTTON_LABEL,
} from "@/domains/game/result/constants/gameResultLabels.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 틀 그림 버튼 (데스크톱 LabelledActionButton 모바일판, 부모 칸을 나눠 채우고 높이 44px 이상)
const FRAME_LOOK = {
    button: "relative flex h-13 min-w-0 flex-1 items-center justify-center transition-transform active:scale-[0.97] disabled:opacity-70 land:h-11 md:h-14",
    img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
    label: "relative truncate px-3 font-subheading text-lg font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
}

const ROW_CLASS =
    "mx-auto flex w-full max-w-[30rem] items-center gap-3 px-4 py-2.5 land:max-w-[26rem] land:py-1.5 md:max-w-[34rem]"

const PLAIN_BTN_CLASS =
    "mx-auto min-h-11 px-4 font-subheading text-base font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// hasResult: 결과 그렸는지 (없으면 글자 버튼 하나, 데스크톱과 같음)
export default function ResultActions({ hasResult, isReturning, onReturnToMatching, onExitToLobby, onLeaveUnavailable }) {
    return (
        <ShellBottom>
            <div className="border-t border-[#3a2818]/70 bg-black/80">
                <motion.div
                    className={ROW_CLASS}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...UI_REVEAL_TRANSITION, delay: LOBBY_BTN_REVEAL_DELAY }}
                >
                    {hasResult ? (
                        <>
                            <ImageButton
                                look={FRAME_LOOK}
                                src={GAME_RESULT_ASSETS.matchingButton}
                                label={GAME_RESULT_MATCHING_BUTTON_LABEL}
                                ariaLabel={GAME_RESULT_MATCHING_BUTTON_LABEL}
                                onClick={onReturnToMatching}
                                disabled={isReturning}
                                busy={isReturning}
                            />
                            <ImageButton
                                look={FRAME_LOOK}
                                src={GAME_RESULT_ASSETS.lobbyButton}
                                label={GAME_RESULT_LOBBY_BUTTON_LABEL}
                                ariaLabel={GAME_RESULT_LOBBY_BUTTON_LABEL}
                                onClick={onExitToLobby}
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
