// 대기방 위 줄: 뒤로 가기·파티 인원·친구 초대·음소거·방장 메뉴(⋯)
// GameMatchingPage가 씀, 데스크톱 구석 조작(뒤로·소리·친구 버튼)과 인원 머리말·방장 버튼을 한 줄로 모음
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import MuteToggle from "@m/shared/ui/sound/MuteToggle.jsx"
import { BACK_BUTTON_SRC, ICON_BTN_CLASS, ROOM_MENU_COPY } from "../../constants/matchingMobileStyles.js"

// 위 줄 (친구 초대·방장 메뉴는 쓸 수 있을 때만)
export default function MatchingTopBar({
  visible,
  partyCount,
  onBack,
  canOpenFriendInvite,
  friendInviteOpen,
  onToggleFriendInvite,
  showHostMenu,
  onOpenHostMenu,
}) {
  return (
    <motion.header
      className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-gradient-to-b from-black/85 to-black/0 px-1.5"
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

      {/* 파티 인원 (읽기 프로그램엔 한 문장으로) */}
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 pl-1"
        role="status"
        aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
      >
        <PublicAsset src={GAME_MATCHING_ASSETS.silhouetteNotReady} alt="" className="h-7 w-7 shrink-0 object-contain opacity-80 invert" />
        <span aria-hidden="true" className="truncate font-display app-text-scaled [--app-text-size:1.1rem] font-bold text-[#f5f0e6]">
          {MATCHING_POPUP_COPY.partyLabel} <span className="text-[#d61f1f]">{partyCount}</span>명
        </span>
      </div>

      {canOpenFriendInvite ? (
        <button
          type="button"
          aria-label="친구 초대"
          aria-expanded={friendInviteOpen}
          onClick={onToggleFriendInvite}
          className={ICON_BTN_CLASS}
        >
          <PublicAsset src={FRIEND_LIST_ASSETS.openButton} alt="" className="block h-10 w-10 select-none object-contain" />
        </button>
      ) : null}

      <MuteToggle className={ICON_BTN_CLASS} iconClassName="block h-9 w-9 select-none object-contain" title />

      {/* 방장 메뉴: 설정 변경·추방 (방장 아니면 안 보임) */}
      {showHostMenu ? (
        <button
          type="button"
          aria-label={ROOM_MENU_COPY.open}
          aria-haspopup="dialog"
          onClick={onOpenHostMenu}
          className={`${ICON_BTN_CLASS} rounded-full border border-[#c9b892]/60 bg-black/55 text-[#f5f0e6]`}
        >
          <span aria-hidden="true" className="text-2xl leading-none tracking-tighter">⋯</span>
        </button>
      ) : null}
    </motion.header>
  )
}
