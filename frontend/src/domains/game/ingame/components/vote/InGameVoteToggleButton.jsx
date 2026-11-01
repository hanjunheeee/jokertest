import { INGAME_VOTE_ASSETS } from "@/domains/game/ingame/constants/vote/ingameVoteAssets.js"
import {
  TOGGLE_BTN_CLASS,
  TOGGLE_BTN_IMG_CLASS,
  TOGGLE_BTN_LABEL_CLASS,
  TOGGLE_BTN_WRAP_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function InGameVoteToggleButton({
  onClick,
  className = TOGGLE_BTN_WRAP_CLASS,
  buttonClassName = TOGGLE_BTN_CLASS,
  imgClassName = TOGGLE_BTN_IMG_CLASS,
  labelClassName = TOGGLE_BTN_LABEL_CLASS,
}) {
  return (
    <div className={className}>
      <button
        type="button"
        aria-label="투표 현황 열기"
        onClick={onClick}
        className={buttonClassName}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={INGAME_VOTE_ASSETS.toggleButton}
          alt=""
          className={imgClassName}
        />
        <span className={labelClassName}>투표 현황</span>
      </button>
    </div>
  )
}