// 세로 카톡형 재판: 피고 안내 문구·초상 등장 후 퇴장 (유무죄 버튼은 시트에서만)
// TalkLayout이 씀
import { useCallback } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
    BACKDROP_MOTION,
    CARD_MOTION,
} from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationMotion.js"
import { useHudInset } from "../../../hooks/overlays/useHudInset.js"
import {
    TRIBUNAL_TALK_EXIT_MS,
    useTribunalTalkSequence,
} from "../../../hooks/overlays/useTribunalTalkSequence.js"
import { TRIBUNAL_PRESENTATION_FIXED_CLASS } from "@m/domains/game/ingame/constants/tribunalPresentationLayer.js"
import DefendantCard from "./DefendantCard.jsx"

const STAGE_CLASS = "flex h-full flex-col items-center justify-center gap-4 px-4"
const CLUSTER_CLASS = "flex w-full max-w-[24rem] flex-col items-center gap-5"
const CARD_WRAP_CLASS = "w-[min(56vw,16rem,36svh)]"

const ACCUSATION_TEXT_CLASS =
    "max-w-[min(92vw,22rem)] text-balance text-center font-display app-text-scaled [--app-text-size:clamp(1.05rem,4.6vw,1.4rem)] font-medium leading-snug tracking-normal text-[#f5e8c8] antialiased [text-shadow:0_2px_8px_rgba(0,0,0,0.88)]"

// 안내 문구가 초상보다 조금 먼저 뜸
const ACCUSATION_MOTION = {
    hidden: { opacity: 0, y: -14, scale: 0.94 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 400, damping: 26, mass: 0.85, delay: 0.05 },
    },
}

const CLUSTER_EXIT = {
    opacity: 0,
    scale: 0.9,
    y: "-8%",
    transition: { duration: TRIBUNAL_TALK_EXIT_MS / 1000, ease: [0.22, 1, 0.36, 1] },
}

function accusationLine(nickname) {
    const name = typeof nickname === "string" && nickname.length > 0 ? nickname : "피고"
    return (
        <>
            <span className="text-[#fff1d6]">{name}</span>
            {" 님이 범인으로 지목됐습니다."}
        </>
    )
}

export default function TribunalTalkPresentation({ open, onDismiss, defendant }) {
    const reduced = useReducedMotion()
    const hudInset = useHudInset()
    const handleDismiss = useCallback(() => onDismiss?.(), [onDismiss])
    const phase = useTribunalTalkSequence({
        open,
        defendantId: defendant?.id ?? null,
        reducedMotion: reduced,
        onDismiss: handleDismiss,
    })

    if (!defendant) return null

    const insetStyle = hudInset > 0 ? { paddingTop: hudInset } : undefined
    const exiting = phase === "exit"

    return createPortal(
        <AnimatePresence>
            {open && phase !== "idle" ? (
                <motion.div
                    key="tribunal-talk-presentation"
                    className={`pointer-events-auto ${TRIBUNAL_PRESENTATION_FIXED_CLASS}`}
                    role="presentation"
                    data-ingame-tribunal-presentation=""
                    data-ingame-tribunal-layout={phase}
                    style={insetStyle}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        className="absolute inset-0 bg-black/62"
                        variants={BACKDROP_MOTION}
                        initial={reduced ? false : "hidden"}
                        animate={exiting ? { opacity: 0, transition: { duration: TRIBUNAL_TALK_EXIT_MS / 1000 } } : "visible"}
                        aria-hidden="true"
                    />
                    <div className={`relative h-full ${STAGE_CLASS}`}>
                        <motion.div
                            className={CLUSTER_CLASS}
                            animate={exiting ? CLUSTER_EXIT : false}
                        >
                            <motion.p
                                className={ACCUSATION_TEXT_CLASS}
                                variants={ACCUSATION_MOTION}
                                initial={reduced ? false : "hidden"}
                                animate={reduced ? undefined : "visible"}
                            >
                                {accusationLine(defendant.nickname)}
                            </motion.p>
                            <div className={CARD_WRAP_CLASS}>
                                <motion.div
                                    variants={CARD_MOTION}
                                    initial={reduced ? false : "hidden"}
                                    animate={reduced ? undefined : "visible"}
                                >
                                    <DefendantCard defendant={defendant} className="w-full" />
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    )
}