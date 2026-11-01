import { INGAME_TIMEBAR_ASSETS } from "../../constants/timebar/ingameTimebarAssets.js"
import {
  INGAME_TIMEBAR_PHASE_HEADER_PLATE_CLASS,
  INGAME_TIMEBAR_PHASE_HEADER_TITLE_CLASS,
  INGAME_TIMEBAR_PHASE_HEADER_WRAP_CLASS,
} from "../../constants/timebar/ingameTimebarLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 확대 시간흐름바 상단 중앙 — 탑레벨 프레임 + phase 상태 문구(프로토타입 「밤 활동 시간」 영역). */
export default function InGameTimebarPhaseHeader({
  label,
  wrapClassName = INGAME_TIMEBAR_PHASE_HEADER_WRAP_CLASS,
}) {
  if (typeof label !== "string" || label.length === 0) return null

  return (
    <div className={wrapClassName}>
      <PublicAsset
        src={INGAME_TIMEBAR_ASSETS.phaseHeaderPlate}
        alt=""
        className={INGAME_TIMEBAR_PHASE_HEADER_PLATE_CLASS}
      />
      <p className={INGAME_TIMEBAR_PHASE_HEADER_TITLE_CLASS}>{label}</p>
    </div>
  )
}
