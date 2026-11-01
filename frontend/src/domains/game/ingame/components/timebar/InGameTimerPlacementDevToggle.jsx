// 개발용 타이머 자리 전환 버튼: 시간 바 확대 ↔ 채팅 틀 안을 눌러서 비교
// 인게임 화면(InGamePage)이 사용, 배포 빌드에선 안 그림
import { INGAME_TIMER_PLACEMENT } from "../../constants/timebar/ingameTimerPlacement.js"

// 지금 자리 글을 보여 주고 누르면 다음 자리로 (Ctrl+Shift+T와 같음)
export default function InGameTimerPlacementDevToggle({
  timerPlacement,
  onCycle,
}) {
  if (import.meta.env?.DEV !== true) return null

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
