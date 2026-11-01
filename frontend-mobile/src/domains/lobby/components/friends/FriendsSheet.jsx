// 로비 친구 시트 (폰 세로는 화면 전체, 가로·태블릿은 오른쪽 패널, 탭 다섯 개)
// LobbyPage가 { open, onClose }로 엶, 대기방에서 쓰면 roomId·isRoomVerified로 초대 버튼이 켜짐
import { useId } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { getAriaLabel } from "@/domains/lobby/utils/friendListPanelAria.js"
import { FRIEND_PANEL_TRANSITION } from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendsSheet } from "../../hooks/friends/useFriendsSheet.js"
import { useEscapeClose } from "../../hooks/friends/useEscapeClose.js"
import { SHEET_CLASS, SHEET_FRAME_STYLE } from "./sheetStyle.js"
import SheetHeader from "./SheetHeader.jsx"
import SheetTabs from "./SheetTabs.jsx"
import SheetBody from "./SheetBody.jsx"
import SfxDiagnostics from "./parts/SfxDiagnostics.jsx"
import CloseButton from "./parts/CloseButton.jsx"

// 훅은 닫혀 있어도 부름 (데스크톱 패널과 같이 열림 값으로 목록 받기를 켜고 끔)
export default function FriendsSheet({ open, onClose, roomId = null, isRoomVerified = false }) {
  const sheet = useFriendsSheet({ open, onClose, roomId, isRoomVerified })
  useEscapeClose(open, sheet.close)
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const titleId = `${baseId}-title`
  const counts = {
    accept: sheet.sync.incomingRequests.length,
    invite: sheet.inviteList.pendingCount,
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="friends-sheet"
          className="fixed inset-0 z-50 flex safe-pt safe-pb safe-px"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FRIEND_PANEL_TRANSITION}
        >
          {/* 뒤 배경 전체가 닫기 버튼 (가로·태블릿에서 보임) */}
          <button type="button" aria-label="친구 목록 닫기" onClick={sheet.close} className="absolute inset-0 cursor-default border-0 bg-black/55 p-0" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={SHEET_CLASS}
            style={SHEET_FRAME_STYLE}
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            transition={FRIEND_PANEL_TRANSITION}
          >
            <div className="relative flex min-h-0 flex-1 flex-col bg-black/35 px-2.5 pt-1.5 pb-2">
              <SheetHeader title={getAriaLabel(sheet.view)} titleId={titleId} onClose={sheet.close} />
              <div className="flex shrink-0 items-start gap-1.5">
                <SheetTabs active={sheet.view} onSelect={sheet.selectView} counts={counts} panelId={panelId} />
                <CloseButton onClick={sheet.close} className="hidden land:grid" />
              </div>
              <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-tab-${sheet.view}`} className="flex min-h-0 flex-1 flex-col">
                <SheetBody sheet={sheet} />
              </div>
              <SfxDiagnostics />
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
