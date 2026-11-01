// 대기방 팝업 안쪽: 안내 문구·자리 그림·기다림 문구
// MatchingPopupPanel이 씀
import { MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_PROMPT_CLASS,
  WAITING_MSG_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"
import MatchingPartySlots from "./MatchingPartySlots.jsx"

// 틀 그림 장식을 피해 안쪽 여백 줌
const CONTENT_INSET = {
  paddingTop: "14%",
  paddingBottom: "20%",
  paddingLeft: "11%",
  paddingRight: "11%",
}

// 팝업 안쪽 내용
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

      {/* 기다림 문구 있을 때만 (파티 방 기다리는 중) */}
      {waitingMessage ? (
        <p className={WAITING_MSG_CLASS}>{waitingMessage}</p>
      ) : null}
    </div>
  )
}
