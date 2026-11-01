import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"

/** DEV 전용 — phase 타이머를 timebar / chat 위치에서 A·B 비교 */
export default function InGameTimerPlacementDevToggle({
  timerPlacement,
  onCycle,
}) {
  if (!import.meta.env.DEV) return null

  const isChat = timerPlacement === INGAME_TIMER_PLACEMENT.CHAT

  return (
    <button
      type="button"
      data-ingame-timer-placement-dev=""
      className="pointer-events-auto fixed bottom-3 left-3 z-[70] rounded border border-[#d4a843]/50 bg-black/75 px-2.5 py-1.5 font-subheading text-[0.72rem] font-bold leading-none tracking-wide text-[#f5e8c8] shadow-[0_2px_8px_rgba(0,0,0,0.6)] backdrop-blur-sm hover:border-[#d4a843] hover:bg-black/90"
      onClick={onCycle}
      title="Ctrl+Shift+T — 타이머 위치 전환"
    >
      타이머 위치: {isChat ? "채팅 프레임 안" : "시간바 확대"}
    </button>
  )
}
