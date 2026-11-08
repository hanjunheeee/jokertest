// 로비 친구 시트 (알림 팝업과 비슷한 중앙 모달 크기, 탭 네 개 + 목록)
// LobbyPage가 { open, onClose }로 엶, 대기방에서 쓰면 roomId·isRoomVerified로 초대 버튼이 켜짐
import { AnimatePresence, motion } from "framer-motion"
import { getAriaLabel } from "@/domains/lobby/utils/friendListPanelAria.js"
import { FRIEND_PANEL_TRANSITION } from "@/domains/lobby/constants/friendListStyle.js"
import { useFriendsSheet } from "../../hooks/friends/useFriendsSheet.js"
import { useEscapeClose } from "@m/shared/hooks/useEscapeClose.js"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import {
  CLOSE_BTN_CLASS,
  CLOSE_BUTTON_SRC,
  CLOSE_ICON_CLASS,
  SHEET_CLASS,
  SHEET_FRAME_STYLE,
  SHEET_ROOT_CLASS,
} from "./sheetStyle.js"
import SheetTabs from "./SheetTabs.jsx"
import SheetBody from "./SheetBody.jsx"
import SfxDiagnostics from "./parts/SfxDiagnostics.jsx"

// 훅은 닫혀 있어도 부름 (데스크톱 패널과 같이 열림 값으로 목록 받기를 켜고 끔)
// 닫기는 프레임 우상단, 탭 줄과 분리 (배경 탭으로도 닫기 가능)
export default function FriendsSheet({ open, onClose, roomId = null, isRoomVerified = false }) {
  const sheet = useFriendsSheet({ open, onClose, roomId, isRoomVerified })
  useEscapeClose(open, sheet.close)

  return (
    <AnimatePresence>
      {open ? (
        <div key="friends-sheet" className={SHEET_ROOT_CLASS}>
          {/* 뒤 배경 전체가 닫기 버튼 (알림 팝업과 같은 어둡기) */}
          <motion.button
            type="button"
            aria-label="친구 목록 닫기"
            onClick={sheet.close}
            className="pointer-events-auto absolute inset-0 cursor-default border-0 bg-black/70 p-0"
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={FRIEND_PANEL_TRANSITION}
          >
            <CloseButton
              label="친구 목록 닫기"
              onClick={sheet.close}
              src={CLOSE_BUTTON_SRC}
              className={CLOSE_BTN_CLASS}
              iconClassName={CLOSE_ICON_CLASS}
              data-sfx-kind="ui-cancel"
            />
            <div className="relative -mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pb-2 pt-0">
              <div className="mb-2.5 shrink-0 pr-1 pt-4">
                <SheetTabs active={sheet.view} onSelect={sheet.selectView} inviteCount={sheet.inviteList.pendingCount} />
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
