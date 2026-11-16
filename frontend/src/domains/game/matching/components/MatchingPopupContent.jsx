// 대기방 팝업 안쪽: 안내 문구·방 정보 줄(방 이름·앉은 수/정원)·자리 그림·기다림 문구
// MatchingPopupPanel이 씀
import { MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_PROMPT_CLASS,
  WAITING_MSG_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"
import MatchingPartySlots from "./MatchingPartySlots.jsx"
import MatchingRoomInfoLine from "./MatchingRoomInfoLine.jsx"

// 틀 그림 장식을 피해 안쪽 여백 줌
const CONTENT_INSET = {
  paddingTop: "14%",
  paddingBottom: "20%",
  paddingLeft: "11%",
  paddingRight: "11%",
}

// 팝업 안쪽 내용
export default function MatchingPopupContent({ slots, waitingMessage = "", roomTitle = null, partyCount = 0, partyMax = null }) {
  return (
    <div
      className="absolute inset-0 flex min-h-0 flex-col items-stretch overflow-hidden"
      style={CONTENT_INSET}
    >
      <p className={`${MATCHING_PROMPT_CLASS} shrink-0`}>
        {MATCHING_POPUP_COPY.prompt}
      </p>

      <MatchingRoomInfoLine roomTitle={roomTitle} partyCount={partyCount} partyMax={partyMax} />

      <MatchingPartySlots slots={slots} />

      {/* 기다림 문구 있을 때만 (판 끝 뒤 원래 방장 자리를 남겨 둔 동안) */}
      {waitingMessage ? (
        <p className={WAITING_MSG_CLASS}>{waitingMessage}</p>
      ) : null}
    </div>
  )
}
