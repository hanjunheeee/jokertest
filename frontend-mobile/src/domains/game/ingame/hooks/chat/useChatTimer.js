// 채팅 칸 단계 타이머 훅: 타이머 자리가 채팅인지와 단계 마감 시각
// ChatPanel이 씀, 값은 데스크톱 InGamePage와 같은 마감·상태 글·자리 훅
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectInGameTimebarPhaseDeadline } from "@/domains/game/ingame/utils/timebar/phaseDeadline.js"
import { selectInGameTimebarStatusLabel } from "@/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js"
import { useTimerPlacement } from "@/domains/game/ingame/hooks/timebar/useTimerPlacement.js"
import { INGAME_TIMER_PLACEMENT } from "@/domains/game/ingame/constants/timebar/ingameTimerPlacement.js"

// 데스크톱 InGameChatShell 조건 그대로: 자리가 채팅이고 단계 글이 있을 때만 보임 (진행 계산은 타이머가 보일 때만)
export function useChatTimer() {
    const gameState = useInGameStore((s) => s.state)
    const deadline = useInGameStore((s) => selectInGameTimebarPhaseDeadline(s.state ?? null))
    const statusLabel = selectInGameTimebarStatusLabel(gameState)
    const { timerPlacement } = useTimerPlacement()

    const visible =
        timerPlacement === INGAME_TIMER_PLACEMENT.CHAT
        && typeof statusLabel === "string"
        && statusLabel.length > 0

    return { visible, deadline }
}
