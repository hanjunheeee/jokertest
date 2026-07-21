import { INGAME_VOTE_ASSETS } from "@/domains/game/ingame/constants/vote/ingameVoteAssets.js"
import {
  INGAME_VOTE_TOGGLE_BTN_CLASS,
  INGAME_VOTE_TOGGLE_BTN_IMG_CLASS,
  INGAME_VOTE_TOGGLE_BTN_LABEL_CLASS,
  INGAME_VOTE_TOGGLE_BTN_WRAP_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 인게임 화면 — 투표현황 팝업 열기 버튼 */
export default function InGameVoteToggleButton({ onClick, className = INGAME_VOTE_TOGGLE_BTN_WRAP_CLASS }) {
  return (
    <div className={className}>
      <button
        type="button"
        aria-label="투표 현황 열기"
        onClick={onClick}
        className={INGAME_VOTE_TOGGLE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={INGAME_VOTE_ASSETS.toggleButton}
          alt=""
          className={INGAME_VOTE_TOGGLE_BTN_IMG_CLASS}
        />
        <span className={INGAME_VOTE_TOGGLE_BTN_LABEL_CLASS}>투표 현황</span>
      </button>
    </div>
  )
}