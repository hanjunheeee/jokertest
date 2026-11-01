// 친구 목록 패널 뒤 어두운 배경 (누르면 닫힘)
// FriendListPanel이 패널 열릴 때 그림
import { motion } from "framer-motion"
import {
  FRIEND_PANEL_BACKDROP_CLASS,
  FRIEND_PANEL_TRANSITION,
} from "../../../constants/friendListStyle.js"

// 배경 전체가 닫기 버튼이라 접근성 이름을 붙임
export default function FriendListPanelBackdrop({ onClose }) {
  return (
    <motion.button
      type="button"
      aria-label="친구 목록 닫기"
      className={FRIEND_PANEL_BACKDROP_CLASS}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FRIEND_PANEL_TRANSITION}
      onClick={onClose}
    />
  )
}
