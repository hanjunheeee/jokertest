// 친구 목록 패널 틀 (대화상자 역할·프레임 이미지·안쪽 여백)
// FriendListPanel이 탭 내용을 감쌀 때 씀
import { motion } from "framer-motion"
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import {
  FRIEND_PANEL_CLASS,
  PANEL_CONTENT_CLASS,
  PANEL_FRAME_CLASS,
  PANEL_INSET_STYLE,
  FRIEND_PANEL_TRANSITION,
} from "../../../constants/friendListStyle.js"
import { getAriaLabel } from "../../../utils/friendListPanelAria.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

// 지금 탭 이름을 대화상자 이름으로 씀, 안쪽 클릭이 배경 닫기로 새지 않게 막음
export default function FriendListPanelFrame({ view, children }) {
  return (
    <motion.aside
      role="dialog"
      aria-modal="true"
      aria-label={getAriaLabel(view)}
      className={FRIEND_PANEL_CLASS}
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 28 }}
      transition={FRIEND_PANEL_TRANSITION}
      onClick={(event) => event.stopPropagation()}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.panelFrame}
        alt=""
        className={PANEL_FRAME_CLASS}
      />
      <div className={PANEL_CONTENT_CLASS} style={PANEL_INSET_STYLE}>
        {children}
      </div>
    </motion.aside>
  )
}
