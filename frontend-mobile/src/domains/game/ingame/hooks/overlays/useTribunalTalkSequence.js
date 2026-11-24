// 카톡형 재판 연출 단계: 등장 → 잠시 유지 → 카드·버튼 퇴장 → 채팅으로
// TribunalTalkPresentation이 씀, 시간은 데스크톱 INTRO_HOLD_MS
import { useEffect, useState } from "react"
import { INTRO_HOLD_MS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"

export const TRIBUNAL_TALK_EXIT_MS = 520

/** @typedef {'idle' | 'enter' | 'exit'} TribunalTalkSequencePhase */

// 피고가 바뀌거나 열릴 때 처음부터, 퇴장 끝나면 onDismiss
export function useTribunalTalkSequence({ open, defendantId, reducedMotion, onDismiss }) {
    /** @type {[TribunalTalkSequencePhase, (p: TribunalTalkSequencePhase) => void]} */
    const [phase, setPhase] = useState("idle")

    useEffect(() => {
        if (!open || !defendantId) {
            setPhase("idle")
            return undefined
        }

        setPhase("enter")

        if (reducedMotion) {
            onDismiss?.()
            setPhase("idle")
            return undefined
        }

        const exitTimer = window.setTimeout(() => setPhase("exit"), INTRO_HOLD_MS)
        const doneTimer = window.setTimeout(() => {
            setPhase("idle")
            onDismiss?.()
        }, INTRO_HOLD_MS + TRIBUNAL_TALK_EXIT_MS)

        return () => {
            window.clearTimeout(exitTimer)
            window.clearTimeout(doneTimer)
        }
    }, [open, defendantId, reducedMotion, onDismiss])

    return phase
}