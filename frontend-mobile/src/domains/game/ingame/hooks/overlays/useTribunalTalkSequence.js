// 카톡형 재판 연출 단계: 등장 → 잠시 유지 → 카드·버튼 퇴장 → 채팅으로
// TribunalTalkPresentation이 씀, 시간은 데스크톱 INTRO_HOLD_MS
import { useEffect, useState } from "react"
import { INTRO_HOLD_MS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"

export const TRIBUNAL_TALK_EXIT_MS = 520

/** @typedef {'idle' | 'enter' | 'exit'} TribunalTalkSequencePhase */

// 열림·피고·줄인 움직임으로 처음 단계 고르기 (열렸고 피고 있고 움직임이 있으면 등장, 아니면 쉼)
// 예: 열림·피고 "p1"·움직임 있음 → "enter", 닫힘 → "idle", 줄인 움직임 → "idle"(바로 끝)
function pickStartPhase(open, defendantId, reducedMotion) {
    return open && defendantId && !reducedMotion ? "enter" : "idle"
}

// 피고가 바뀌거나 열릴 때 처음부터, 퇴장 끝나면 onDismiss
export function useTribunalTalkSequence({ open, defendantId, reducedMotion, onDismiss }) {
    /** @type {[TribunalTalkSequencePhase, (p: TribunalTalkSequencePhase) => void]} */
    const [phase, setPhase] = useState(() => pickStartPhase(open, defendantId, reducedMotion))

    // 받은 값(열림·피고·줄인 움직임·닫기 함수)이 바뀌면 그리는 중에 처음 단계로 맞춤 (effect 안에서 상태를 바로 바꾸지 않게)
    const [seen, setSeen] = useState({ open, defendantId, reducedMotion, onDismiss })
    if (seen.open !== open || seen.defendantId !== defendantId
        || seen.reducedMotion !== reducedMotion || seen.onDismiss !== onDismiss) {
        setSeen({ open, defendantId, reducedMotion, onDismiss })
        setPhase(pickStartPhase(open, defendantId, reducedMotion))
    }

    // 시계: 잠시 유지 뒤 퇴장, 퇴장 끝나면 쉼 + onDismiss (줄인 움직임이면 바로 onDismiss)
    useEffect(() => {
        if (!open || !defendantId) return undefined

        if (reducedMotion) {
            onDismiss?.()
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
