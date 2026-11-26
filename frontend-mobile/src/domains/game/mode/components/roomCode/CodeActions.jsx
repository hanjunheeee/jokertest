// 방코드 틀 아래 단추 줄: 취소·참여하기 표시 및 입장 요청 중 중복 클릭 잠금
// RoomInvitePage가 CodeFrame footer로 전달함
import { motion } from "framer-motion"
import { BUTTON_ROW_VARIANTS, BUTTON_VARIANTS } from "@/domains/game/mode/constants/roomInviteAnimations.js"
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 단추 칸은 44px 이상, 잠기면 반투명·클릭 막기 적용
const BTN_CLASS =
  "pointer-events-auto relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent p-0 leading-none transition-[scale] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 md:max-w-[15.25rem]"

// 글자 크기만 폰 칸에 맞춤
const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.95rem,4vw,1.3rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 그림 단추 하나
function ActionButton({ src, label, onClick, disabled = false }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      variants={BUTTON_VARIANTS}
      className={BTN_CLASS}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span className={LABEL_CLASS} aria-hidden="true">{label}</span>
    </motion.button>
  )
}

// 취소·참여 단추 줄
export default function CodeActions({ onCancel, onJoin, isJoining = false }) {
  return (
    <motion.div
      variants={BUTTON_ROW_VARIANTS}
      className="mx-auto flex w-full items-center justify-center gap-3 md:max-w-[76%]"
    >
      <ActionButton src={ROOM_INVITE_ASSETS.cancelButton} label="취소" onClick={onCancel} />
      <ActionButton src={ROOM_INVITE_ASSETS.joinButton} label="참여하기" onClick={onJoin} disabled={isJoining} />
    </motion.div>
  )
}
