// 재판 연출 창: 피고 카드·유무죄 버튼이 먼저 크게, 잠시 뒤 카드가 위로 줄고 아래에 최후의 반론 채팅
// 재판 문지기(TribunalGate)·재판 미리보기 화면이 씀 (세로: 위 카드 + 아래 채팅, 가로 폰: 왼쪽 카드 + 오른쪽 채팅, 덮개 짙기·움직임은 데스크톱 값)
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion"
import {
    BACKDROP_MOTION,
    CARD_MOTION,
    CHAT_MOTION,
    SPLIT_TRANSITION,
} from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationMotion.js"
import { useTribunalIntro } from "../../../hooks/overlays/useTribunalIntro.js"
import DefendantCard from "./DefendantCard.jsx"
import TribunalChat from "./TribunalChat.jsx"
import TribunalActions from "./TribunalActions.jsx"

// intro는 카드 가운데 크게, split은 세로면 위 줄(카드 왼쪽·버튼 오른쪽), 가로 폰이면 왼쪽 칸
const STAGE_CLASS = {
    intro: "flex h-full flex-col items-center justify-center gap-4 px-4",
    split: "mx-auto flex h-full w-full flex-col gap-3 px-3 pb-3 pt-2 land:flex-row land:items-stretch md:max-w-[46rem] md:px-8 md:pb-6",
}
const TOP_CLASS = {
    intro: "flex w-full flex-col items-center gap-4",
    split: "flex w-full shrink-0 flex-row items-center gap-3 land:w-[34%] land:flex-col land:justify-center md:justify-center",
}
const CARD_CLASS = {
    intro: "w-[min(56vw,16rem,36svh)] land:w-[min(26vw,46svh)]",
    split: "w-[min(30vw,8.5rem)] shrink-0 md:w-[11rem] land:w-[min(20vw,34svh)]",
}

// 투표 버튼 못 보이면 안내 문구, 판정 버튼은 글자 받았을 때만
export default function TribunalOverlay({
    defendant,
    showVoteButtons = false,
    noticeText = null,
    voteButtonsEnabled = false,
    voteSubmitting = false,
    onVoteGuilty,
    onVoteNotGuilty,
    chatProps = null,
    devResolveLabel = null,
    devResolveEnabled = false,
    onDevResolve = null,
}) {
    const reduced = useReducedMotion()
    const layoutPhase = useTribunalIntro(defendant?.id ?? null)
    if (!defendant) return null

    const showChat = layoutPhase === "split" && chatProps
    const layoutTransition = reduced ? { duration: 0 } : SPLIT_TRANSITION

    return (
        <div
            className="fixed inset-0 z-[55] safe-pt safe-pb safe-px"
            role="presentation"
            data-ingame-tribunal-presentation=""
            data-ingame-tribunal-layout={layoutPhase}
        >
            <motion.div
                className="absolute inset-0 bg-black/62"
                variants={BACKDROP_MOTION}
                initial={reduced ? false : "hidden"}
                animate={reduced ? undefined : "visible"}
                aria-hidden="true"
            />
            <LayoutGroup>
                <div className={`relative ${STAGE_CLASS[layoutPhase]}`}>
                    <motion.div layout transition={layoutTransition} className={TOP_CLASS[layoutPhase]}>
                        <motion.div layout transition={layoutTransition} className={CARD_CLASS[layoutPhase]}>
                            <motion.div
                                variants={CARD_MOTION}
                                initial={reduced ? false : "hidden"}
                                animate={reduced ? undefined : "visible"}
                            >
                                <DefendantCard defendant={defendant} className="w-full" />
                            </motion.div>
                        </motion.div>

                        <motion.div layout transition={layoutTransition} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 self-stretch">
                            <TribunalActions
                                showVoteButtons={showVoteButtons}
                                noticeText={noticeText}
                                voteDisabled={!voteButtonsEnabled || voteSubmitting}
                                onVoteGuilty={onVoteGuilty}
                                onVoteNotGuilty={onVoteNotGuilty}
                                devResolveLabel={devResolveLabel}
                                devResolveEnabled={devResolveEnabled}
                                onDevResolve={onDevResolve}
                            />
                        </motion.div>
                    </motion.div>

                    <AnimatePresence>
                        {showChat ? (
                            <motion.div
                                key="tribunal-chat"
                                className="flex min-h-0 flex-1 flex-col"
                                variants={CHAT_MOTION}
                                initial={reduced ? false : "hidden"}
                                animate={reduced ? undefined : "visible"}
                                exit="hidden"
                            >
                                <TribunalChat {...chatProps} />
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
            </LayoutGroup>
        </div>
    )
}
