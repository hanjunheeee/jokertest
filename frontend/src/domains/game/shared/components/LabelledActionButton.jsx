// 그림 버튼 위에 글자를 얹은 행동 버튼
// mode 방코드 화면(RoomInvitePage)과 결과 화면(GameResultPage)이 씀
import { motion } from "framer-motion"
import {
  ROOM_CODE_ACTION_BTN_CLASS,
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "@/domains/game/shared/constants/roomCodeFrameStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function LabelledActionButton({ src, label, onClick, className = "", variants }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      variants={variants}
      className={`${ROOM_CODE_ACTION_BTN_CLASS} ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span className={ROOM_CODE_ACTION_BTN_LABEL_CLASS} aria-hidden="true">{label}</span>
    </motion.button>
  )
}
