// 대기방 shell 바닥 왼쪽: 친구 초대 (로비 FriendsButton 디자인, 뒤로가기와 같은 줄)
// GameMatchingPage가 씀
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import FriendsButton from "@m/domains/lobby/components/bottom/FriendsButton.jsx"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"

export default function MatchingFriendInviteBar({ visible, enabled, open, onToggle }) {
  if (!enabled) return null

  return (
    <ShellBottom>
      <motion.div
        className="flex w-full items-end justify-start px-3 pb-2 pt-1 land:px-6 land:pb-1"
        initial={{ opacity: 0, y: 10 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={UI_REVEAL_TRANSITION}
        style={{ pointerEvents: visible ? "auto" : "none" }}
      >
        <FriendsButton open={open} onOpen={onToggle} ariaLabel="친구 초대" />
      </motion.div>
    </ShellBottom>
  )
}