// 로비 친구 시트 (폰 세로는 화면 전체, 가로·태블릿은 오른쪽 패널, 데스크톱 패널과 같은 탭 네 개 + 목록)
// LobbyPage가 { open, onClose }로 엶, 대기방에서 쓰면 roomId·isRoomVerified로 초대 버튼이 켜짐
import { AnimatePresence, motion } from "framer-motion"
import { getAriaLabel } from "@/domains/lobby/utils/friendListPanelAria.js"
import { FRIEND_PANEL_TRANSITION } from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendsSheet } from "../../hooks/friends/useFriendsSheet.js"
import { useEscapeClose } from "@m/shared/hooks/useEscapeClose.js"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import { CLOSE_BTN_CLASS, CLOSE_BUTTON_SRC, CLOSE_ICON_CLASS, SHEET_CLASS, SHEET_FRAME_STYLE } from "./sheetStyle.js"
import SheetTabs from "./SheetTabs.jsx"
import SheetBody from "./SheetBody.jsx"
import SfxDiagnostics from "./parts/SfxDiagnostics.jsx"

// 훅은 닫혀 있어도 부름 (데스크톱 패널과 같이 열림 값으로 목록 받기를 켜고 끔)
// 폰 세로는 뒤 배경이 안 보여 닫기 버튼을 탭 줄 끝에 더함 (데스크톱은 배경 눌러 닫기만)
export default function FriendsSheet({ open, onClose, roomId = null, isRoomVerified = false }) {
  const sheet = useFriendsSheet({ open, onClose, roomId, isRoomVerified })
  useEscapeClose(open, sheet.close)

  return (
    <AnimatePresence>
      {open ? (
        <div key="friends-sheet" className="fixed inset-0 z-50 flex safe-pt safe-pb safe-px">
          {/* 뒤 배경 전체가 닫기 버튼 (데스크톱 FriendListPanelBackdrop과 같은 짙기·움직임) */}
          <motion.button
            type="button"
            aria-label="친구 목록 닫기"
            onClick={sheet.close}
            className="absolute inset-0 cursor-default border-0 bg-black/25 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FRIEND_PANEL_TRANSITION}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={getAriaLabel(sheet.view)}
            className={SHEET_CLASS}
            style={SHEET_FRAME_STYLE}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={FRIEND_PANEL_TRANSITION}
          >
            <div className="relative flex min-h-0 flex-1 flex-col px-2.5 pb-2 pt-1.5">
              <div className="mb-3 flex shrink-0 items-center gap-1.5">
                <SheetTabs active={sheet.view} onSelect={sheet.selectView} inviteCount={sheet.inviteList.pendingCount} />
                <CloseButton
                  label="친구 목록 닫기"
                  onClick={sheet.close}
                  src={CLOSE_BUTTON_SRC}
                  className={CLOSE_BTN_CLASS}
                  iconClassName={CLOSE_ICON_CLASS}
                />
              </div>
              <SheetBody sheet={sheet} />
              <SfxDiagnostics />
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
