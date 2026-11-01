// 결과 화면 맨 위 승리/패배 띠 (틀 그림 + 글자)
// GameResultShell이 씀
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import {
  BANNER_LABEL_CLASS,
  BANNER_LABEL_LOSE_CLASS,
  BANNER_LABEL_WIN_CLASS,
  BANNER_WRAP_CLASS,
  FRAME_IMG_BLOCK_CLASS,
  FRAME_SHADOW_LAYER_BLOCK_CLASS,
  FRAME_STACK_WRAP_CLASS,
} from "../constants/gameResultLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 결과 글자 (모르는 값이면 승리로)
const OUTCOME_LABELS = {
  win: "승리",
  lose: "패배",
}

// 승패 띠, 패배면 글자 색만 바꿈
export default function GameResultBanner({ outcome }) {
  const label = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.win
  const labelToneClass =
    outcome === "lose"
      ? BANNER_LABEL_LOSE_CLASS
      : BANNER_LABEL_WIN_CLASS

  return (
    <div className={BANNER_WRAP_CLASS}>
      <div className={FRAME_STACK_WRAP_CLASS}>
        {/* 같은 틀 그림 두 장: 아래 장은 그림자용 */}
        <PublicAsset
          src={GAME_RESULT_ASSETS.bannerFrame}
          alt=""
          aria-hidden="true"
          className={FRAME_SHADOW_LAYER_BLOCK_CLASS}
        />
        <PublicAsset
          src={GAME_RESULT_ASSETS.bannerFrame}
          alt=""
          className={FRAME_IMG_BLOCK_CLASS}
        />
      </div>
      <p className={`${BANNER_LABEL_CLASS} ${labelToneClass}`}>
        {label}
      </p>
    </div>
  )
}
