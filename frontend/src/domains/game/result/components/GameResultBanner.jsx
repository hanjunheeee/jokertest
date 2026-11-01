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

const OUTCOME_LABELS = {
  win: "승리",
  lose: "패배",
}

export default function GameResultBanner({ outcome }) {
  const label = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.win
  const labelToneClass =
    outcome === "lose"
      ? BANNER_LABEL_LOSE_CLASS
      : BANNER_LABEL_WIN_CLASS

  return (
    <div className={BANNER_WRAP_CLASS}>
      <div className={FRAME_STACK_WRAP_CLASS}>
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
