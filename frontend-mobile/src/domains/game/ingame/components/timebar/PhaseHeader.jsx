// 펼친 진행 바 위 가운데 단계 머리: 머리 판 그림 + [단계-세부] 글
// 진행 바(Timebar)가 씀, 모양은 데스크톱 단계 머리 상수 그대로
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_TIMEBAR_ASSETS } from "@/domains/game/ingame/constants/timebar/ingameTimebarAssets.js"
import {
  PHASE_HEADER_PLATE_CLASS,
  PHASE_HEADER_TITLE_CLASS,
  PHASE_HEADER_WRAP_CLASS,
} from "@/domains/game/ingame/constants/timebar/ingameTimerLayout.js"

// 글이 없으면 판째 안 그림
export default function PhaseHeader({ label }) {
  if (typeof label !== "string" || label.length === 0) return null

  return (
    <div className={PHASE_HEADER_WRAP_CLASS}>
      <PublicAsset src={INGAME_TIMEBAR_ASSETS.phaseHeaderPlate} alt="" className={PHASE_HEADER_PLATE_CLASS} />
      <p className={PHASE_HEADER_TITLE_CLASS} data-timebar-status="">{label}</p>
    </div>
  )
}
