// 파일 역할: LabelledActionButton.jsx - 화면을 구성하는 컴포넌트입니다.
import { motion } from "framer-motion"
import {
  ROOM_CODE_ACTION_BTN_CLASS,
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "@/domains/game/mode/constants/roomCodeFrameStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 이미지 버튼 위에 글자를 올려 보여주는 공통 액션 버튼입니다.
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
