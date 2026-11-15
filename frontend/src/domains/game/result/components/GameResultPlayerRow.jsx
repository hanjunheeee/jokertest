// 결과 목록 한 줄: 프로필·이름·직업, 내 줄이면 "내 정보" 배지·받은 판 골드("+1골드")와 강조, 남의 줄은 오른쪽 끝 덧붙임(신고 버튼) 자리
// GameResultPlayerList가 씀
import { SELF_INFO_BADGE_LABEL, formatGoldRewardLabel } from "../constants/gameResultLabels.js"
import {
  PLAYER_INFO_CLASS,
  PLAYER_JOB_CLASS,
  PLAYER_JOB_SELF_CLASS,
  PLAYER_NAME_CLASS,
  PLAYER_NAME_SELF_CLASS,
  PLAYER_PROFILE_PHOTO_WRAP_CLASS,
  PLAYER_PROFILE_WRAP_CLASS,
  PLAYER_ROW_CLASS,
  PLAYER_ROW_INNER_CLASS,
  PLAYER_ROW_INNER_SELF_CLASS,
  PLAYER_SELF_BADGE_CLASS,
} from "../constants/gameResultLayout.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"

// 받은 판 골드 표시 (내 줄 밝은 바탕 위라 검정 글자)
const GOLD_REWARD_CLASS =
  "shrink-0 rounded-full border border-black/35 bg-[#f5d36b]/80 px-[clamp(0.38rem,1.6cqi,0.55rem)] py-[clamp(0.1rem,0.28vh,0.16rem)] font-subheading app-text-scaled [--app-text-size:clamp(0.66rem,2.4cqi,0.82rem)] font-bold leading-none text-black"

// 참가자 한 줄
export default function GameResultPlayerRow({
  name,
  job,
  profilePhotoSrc,
  profileBorderSrc,
  isSelf = false,
  goldReward = 0,
  trailing = null,
}) {
  // 판 골드는 내 줄에만 (모두 같은 값이라 내 것 하나, 못 받았으면 안 보임)
  const goldLabel = isSelf ? formatGoldRewardLabel(goldReward) : null
  return (
    <li className={PLAYER_ROW_CLASS}>
      <div
        className={`${PLAYER_ROW_INNER_CLASS}${isSelf ? ` ${PLAYER_ROW_INNER_SELF_CLASS}` : ""}`}
      >
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={PLAYER_PROFILE_WRAP_CLASS}
          photoWrapClassName={PLAYER_PROFILE_PHOTO_WRAP_CLASS}
        />

        <div className={PLAYER_INFO_CLASS}>
          {/* 내 줄이면 "내 정보" 배지 */}
          {isSelf ? (
            <span className={PLAYER_SELF_BADGE_CLASS}>
              {SELF_INFO_BADGE_LABEL}
            </span>
          ) : null}
          <p
            className={`${PLAYER_NAME_CLASS}${isSelf ? ` ${PLAYER_NAME_SELF_CLASS}` : ""}`}
          >
            {name}
          </p>
        </div>
        <span
          className={`${PLAYER_JOB_CLASS}${isSelf ? ` ${PLAYER_JOB_SELF_CLASS}` : ""}`}
        >
          {job}
        </span>
        {goldLabel ? (
          <span className={GOLD_REWARD_CLASS} data-testid="game-result-gold-reward">
            {goldLabel}
          </span>
        ) : null}
        {trailing}
      </div>
    </li>
  )
}
