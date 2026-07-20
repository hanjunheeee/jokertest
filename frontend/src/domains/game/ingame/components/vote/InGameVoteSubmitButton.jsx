import { INGAME_VOTE_ASSETS } from "../../constants/vote/ingameVoteAssets.js"
import {
  INGAME_VOTE_SUBMIT_BTN_CLASS,
  INGAME_VOTE_SUBMIT_BTN_IMG_CLASS,
  INGAME_VOTE_SUBMIT_BTN_LABEL_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function InGameVoteSubmitButton({ disabled = false, onClick }) {
  return (
    <button
      type="button"
      aria-label="투표하기"
      disabled={disabled}
      onClick={onClick}
      className={`${INGAME_VOTE_SUBMIT_BTN_CLASS} disabled:cursor-not-allowed disabled:opacity-45`}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={INGAME_VOTE_ASSETS.submitButton}
        alt=""
        className={INGAME_VOTE_SUBMIT_BTN_IMG_CLASS}
      />
      <span className={INGAME_VOTE_SUBMIT_BTN_LABEL_CLASS}>투표하기</span>
    </button>
  )
}
