// 그림 버튼 위에 글자를 얹은 행동 버튼
// mode 방코드 화면(RoomInvitePage)과 결과 화면(GameResultPage)이 씀
import { motion } from "framer-motion"
import {
  ROOM_CODE_ACTION_BTN_CLASS,
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "@/domains/game/shared/constants/roomCodeFrameStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 행동 버튼 (나타나는 움직임은 variants로 받음, disabled면 눌러도 안 부름)
export default function LabelledActionButton({ src, label, onClick, className = "", variants, disabled = false }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      variants={variants}
      className={`${ROOM_CODE_ACTION_BTN_CLASS} disabled:cursor-default disabled:opacity-70 ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span className={ROOM_CODE_ACTION_BTN_LABEL_CLASS} aria-hidden="true">{label}</span>
    </motion.button>
  )
}
