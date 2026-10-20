/**
 * 매칭 팝업 프레임 내부 본문 — 안내 문구·파티 슬롯
 * MatchingPopupPanel이 프레임 inset 위에 배치
 *
 * props
 * - slots: 파티 슬롯 배열 — MatchingPartySlots에 전달
 */
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

/** 프레임 안 prompt·슬롯·대기 안내 블록 */
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
