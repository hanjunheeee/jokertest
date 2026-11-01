// 단계 행동 글자 버튼 하나: 투표 시작 준비·낮 집계·재판 판정·밤 종료
// 행동 줄(ActionRow)이 씀, 모양은 데스크톱 단계 행동 줄 BTN_CLASS (높이만 44px)
import { BTN_CLASS } from "@/domains/game/ingame/constants/actions/ingameActionPanel.js"

// 데스크톱 min-h-8을 터치 높이로 바꿈
const PHASE_BTN_CLASS = BTN_CLASS.replace("min-h-8", "min-h-11")

// action은 data-ingame-phase-action 값 (데스크톱 시험 표시와 같은 이름)
export default function PhaseButton({ action, label, enabled, onClick }) {
  return (
    <button
      type="button"
      data-ingame-phase-action={action}
      className={PHASE_BTN_CLASS}
      disabled={!enabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
