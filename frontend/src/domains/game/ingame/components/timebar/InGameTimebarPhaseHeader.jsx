// 확대 시간 바 위 가운데 단계 머리: 머리 판 그림 + 단계 상태 글
// 단계 타이머 묶음(InGamePhaseTurnTimerPanel)이 사용
import { INGAME_TIMEBAR_ASSETS } from "../../constants/timebar/ingameTimebarAssets.js"
import {
  PHASE_HEADER_PLATE_CLASS,
  PHASE_HEADER_TITLE_CLASS,
  PHASE_HEADER_WRAP_CLASS,
} from "../../constants/timebar/ingameTimerLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 글이 없으면 판째 안 그림
export default function InGameTimebarPhaseHeader({
  label,
  wrapClassName = PHASE_HEADER_WRAP_CLASS,
  titleClassName = PHASE_HEADER_TITLE_CLASS,
  plateSrc = INGAME_TIMEBAR_ASSETS.phaseHeaderPlate,
  plateClassName = PHASE_HEADER_PLATE_CLASS,
}) {
  if (typeof label !== "string" || label.length === 0) return null

  return (
    <div className={wrapClassName}>
      <PublicAsset
        src={plateSrc}
        alt=""
        className={plateClassName}
      />
      <p className={titleClassName}>{label}</p>
    </div>
  )
}
