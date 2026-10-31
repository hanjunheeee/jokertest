import { MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_PROMPT_CLASS,
  MATCHING_WAITING_MESSAGE_CLASS,
} from "../constants/matchingPopupStyles.js"
import MatchingPartySlots from "./MatchingPartySlots.jsx"

const CONTENT_INSET = {
  paddingTop: "14%",
  paddingBottom: "20%",
  paddingLeft: "11%",
  paddingRight: "11%",
}

export default function MatchingPopupContent({ slots, waitingMessage = "" }) {
  return (
    <div
      className="absolute inset-0 flex min-h-0 flex-col items-stretch overflow-hidden"
      style={CONTENT_INSET}
    >
      <p className={`${MATCHING_PROMPT_CLASS} shrink-0`}>
        {MATCHING_POPUP_COPY.prompt}
      </p>

      <MatchingPartySlots slots={slots} />

      {waitingMessage ? (
        <p className={MATCHING_WAITING_MESSAGE_CLASS}>{waitingMessage}</p>
      ) : null}
    </div>
  )
}
