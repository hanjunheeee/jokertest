// 방코드 틀 아래 버튼 줄: 취소·참여하기 (데스크톱처럼 틀 안, 하나씩 올라오는 움직임)
// RoomInvitePage가 CodeFrame footer로 넘김, 틀 안이라 폰 키보드가 올라와도 같이 보임
import { motion } from "framer-motion"
import { BUTTON_ROW_VARIANTS, BUTTON_VARIANTS } from "@/domains/game/mode/constants/roomInviteAnimations.js"
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 버튼 칸은 44px 이상, 그림(215×65)은 칸 가운데 (폰 폭에선 그림 높이가 44px보다 낮을 수 있음)
const BTN_CLASS =
  "pointer-events-auto relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent p-0 leading-none transition-[scale] duration-150 active:scale-95 md:max-w-[15.25rem]"

// 글자 크기만 폰 칸에 맞춤 (색·그림자는 데스크톱 그대로)
const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.95rem,4vw,1.3rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 그림 버튼 하나 (데스크톱 LabelledActionButton과 같은 모양·움직임)
function ActionButton({ src, label, onClick }) {
  return (
    <motion.button type="button" aria-label={label} onClick={onClick} variants={BUTTON_VARIANTS} className={BTN_CLASS}>
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span className={LABEL_CLASS} aria-hidden="true">{label}</span>
    </motion.button>
  )
}

// 취소·참여 버튼 줄 (폰은 틀 폭 가득, 태블릿부터 데스크톱처럼 76%)
export default function CodeActions({ onCancel, onJoin }) {
  return (
    <motion.div
      variants={BUTTON_ROW_VARIANTS}
      className="mx-auto flex w-full items-center justify-center gap-3 md:max-w-[76%]"
    >
      <ActionButton src={ROOM_INVITE_ASSETS.cancelButton} label="취소" onClick={onCancel} />
      <ActionButton src={ROOM_INVITE_ASSETS.joinButton} label="참여하기" onClick={onJoin} />
    </motion.div>
  )
}
