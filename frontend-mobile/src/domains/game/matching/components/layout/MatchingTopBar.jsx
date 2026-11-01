// 대기방 위 줄: 뒤로 가기·파티 인원·친구 초대·음소거
// GameMatchingPage가 씀, 데스크톱 구석 조작(왼쪽 아래 뒤로·오른쪽 아래 친구/소리)과 오른쪽 위 인원 머리말을 한 줄로 모음
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import MuteToggle from "@m/shared/ui/sound/MuteToggle.jsx"
import {
  BACK_BUTTON_SRC,
  ICON_BTN_CLASS,
  PARTY_COUNT_CLASS,
  PARTY_ICON_CLASS,
  PARTY_TEXT_CLASS,
} from "../../constants/matchingMobileStyles.js"

// 위 줄 (친구 초대는 방에 있을 때만, 데스크톱과 같은 조건)
export default function MatchingTopBar({
  visible,
  partyCount,
  onBack,
  canOpenFriendInvite,
  friendInviteOpen,
  onToggleFriendInvite,
}) {
  return (
    <motion.header
      className="sticky top-0 z-20 flex h-14 items-center gap-1 px-1.5 land:h-12"
      initial={{ opacity: 0 }}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <BackButton
        onClick={onBack}
        label="멀티플레이 선택으로 돌아가기"
        src={BACK_BUTTON_SRC}
        className={ICON_BTN_CLASS}
        iconClassName="block h-10 w-10 select-none object-contain"
      />

      {/* 파티 인원 (읽기 프로그램엔 한 문장으로, 데스크톱 MatchingPartyHeader) */}
      <div
        className="flex min-w-0 flex-1 items-center gap-2 pl-1"
        aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
      >
        <PublicAsset src={GAME_MATCHING_ASSETS.silhouetteNotReady} alt="" className={PARTY_ICON_CLASS} />
        <span className={PARTY_TEXT_CLASS}>
          {MATCHING_POPUP_COPY.partyLabel} <span className={PARTY_COUNT_CLASS}>{partyCount}</span>명
        </span>
      </div>

      {/* 친구 초대 (데스크톱 FriendListToggleButton과 같은 그림·이름, 누를 때마다 열고 닫음) */}
      {canOpenFriendInvite ? (
        <button
          type="button"
          aria-label="친구 초대"
          aria-expanded={friendInviteOpen}
          onClick={onToggleFriendInvite}
          className={ICON_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset src={FRIEND_LIST_ASSETS.openButton} alt="" className="block h-10 w-10 select-none object-contain" />
        </button>
      ) : null}

      <MuteToggle className={ICON_BTN_CLASS} iconClassName="block h-9 w-9 select-none object-contain" title />
    </motion.header>
  )
}
