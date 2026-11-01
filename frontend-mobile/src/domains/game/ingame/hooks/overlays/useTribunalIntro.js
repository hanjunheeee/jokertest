// 재판 연출 처음 단계 훅: 피고 카드만 크게(intro) 보이다가 정한 시간 뒤 채팅이 열림(split)
// 재판 연출 창(TribunalOverlay)이 씀, 시간은 데스크톱 INTRO_HOLD_MS
import { useEffect, useState } from "react"
import { useReducedMotion } from "framer-motion"
import { INTRO_HOLD_MS } from "@/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js"

// 피고가 바뀌면 처음부터, 움직임 줄이기면 바로 split
export function useTribunalIntro(defendantId) {
    const reduced = useReducedMotion()
    // 끝난 피고 id를 적어 두고 지금 피고와 같으면 split
    const [splitFor, setSplitFor] = useState(null)

    useEffect(() => {
        if (reduced) return undefined
        const timer = window.setTimeout(() => setSplitFor(defendantId), INTRO_HOLD_MS)
        return () => window.clearTimeout(timer)
    }, [defendantId, reduced])

    return reduced || splitFor === defendantId ? "split" : "intro"
}
