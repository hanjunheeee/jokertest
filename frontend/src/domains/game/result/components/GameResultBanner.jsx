import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import {
  GAME_RESULT_BANNER_LABEL_CLASS,
  GAME_RESULT_BANNER_LABEL_LOSE_CLASS,
  GAME_RESULT_BANNER_LABEL_WIN_CLASS,
  GAME_RESULT_BANNER_WRAP_CLASS,
  GAME_RESULT_FRAME_IMAGE_BLOCK_CLASS,
  GAME_RESULT_FRAME_SHADOW_LAYER_BLOCK_CLASS,
  GAME_RESULT_FRAME_STACK_WRAP_CLASS,
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
      ? GAME_RESULT_BANNER_LABEL_LOSE_CLASS
      : GAME_RESULT_BANNER_LABEL_WIN_CLASS

  return (
    <div className={GAME_RESULT_BANNER_WRAP_CLASS}>
      <div className={GAME_RESULT_FRAME_STACK_WRAP_CLASS}>
        <PublicAsset
          src={GAME_RESULT_ASSETS.bannerFrame}
          alt=""
          aria-hidden="true"
          className={GAME_RESULT_FRAME_SHADOW_LAYER_BLOCK_CLASS}
        />
        <PublicAsset
          src={GAME_RESULT_ASSETS.bannerFrame}
          alt=""
          className={GAME_RESULT_FRAME_IMAGE_BLOCK_CLASS}
        />
      </div>
      <p className={`${GAME_RESULT_BANNER_LABEL_CLASS} ${labelToneClass}`}>
        {label}
      </p>
    </div>
  )
}