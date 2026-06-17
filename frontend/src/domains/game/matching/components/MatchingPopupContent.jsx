/**
 * 매칭 팝업 프레임 내부 본문 — 안내 문구·파티 슬롯·타이머·입력 제한
 * MatchingPopupPanel이 프레임 inset 위에 배치
 *
 * props
 * - slots: 파티 슬롯 배열 — MatchingPartySlots에 전달
 *
 * 타이머 문구·남은 초는 constants 더미 (미구현 TODO: 서버 매칭 타이머 연동)
 */
import {
  GAME_MATCHING_ASSETS,
  MATCHING_POPUP_COPY,
} from "../constants/gameMatchingAssets.js"
import {
  MATCHING_PROMPT_CLASS,
  MATCHING_RESTRICTION_BLOCK_CLASS,
  MATCHING_RESTRICTION_ICON_CLASS,
  MATCHING_RESTRICTION_TEXT_CLASS,
  MATCHING_TIMER_BAR_CLASS,
  MATCHING_TIMER_BLOCK_CLASS,
  MATCHING_TIMER_TEXT_CLASS,
} from "../constants/matchingPopupStyles.js"
import MatchingPartySlots from "./MatchingPartySlots.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const CONTENT_INSET = {
  paddingTop: "14%",
  paddingBottom: "20%",
  paddingLeft: "11%",
  paddingRight: "11%",
}

/** 프레임 안 prompt·슬롯·타이머·키보드 제한 블록 */
export default function MatchingPopupContent({ slots }) {
  return (
    <div
      className="absolute inset-0 flex min-h-0 flex-col items-stretch overflow-hidden"
      style={CONTENT_INSET}
    >
      <p className={`${MATCHING_PROMPT_CLASS} shrink-0`}>
        {MATCHING_POPUP_COPY.prompt}
      </p>

      <MatchingPartySlots slots={slots} />

      <div className={MATCHING_TIMER_BLOCK_CLASS}>
        <PublicAsset
          src={GAME_MATCHING_ASSETS.timerBar}
          alt=""
          className={MATCHING_TIMER_BAR_CLASS}
        />
        <p className={MATCHING_TIMER_TEXT_CLASS}>
          {MATCHING_POPUP_COPY.timerRemaining}
        </p>
      </div>

      <div className={MATCHING_RESTRICTION_BLOCK_CLASS}>
        <PublicAsset
          src={GAME_MATCHING_ASSETS.restrictionMark}
          alt=""
          className={MATCHING_RESTRICTION_ICON_CLASS}
        />
        <span className={MATCHING_RESTRICTION_TEXT_CLASS}>
          {MATCHING_POPUP_COPY.inputRestriction}
        </span>
      </div>
    </div>
  )
}
