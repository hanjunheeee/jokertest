// 프로필 테두리 크게 보기 창 (어두운 뒤판 + 가운데 창: 닫기·테두리 그림·이름)
// guests/ChallengeList.jsx가 씀, 데스크톱 공용 ProfileBorderZoomOverlay(화면 파일이라 못 부름)와 같은 모양·움직임
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import { ZOOM_CLOSE_SRC } from "@m/domains/library/constants/libraryStyle.js"
import {
  BACKDROP_CLASS,
  CLOSE_BTN_CLASS,
  ILLUSTRATION_CLASS,
  ILLUSTRATION_WRAP_CLASS,
  PANEL_CLASS,
  TITLE_CLASS,
  WRAP_CLASS,
  ZOOM_TRANSITION,
} from "@m/domains/library/constants/borderZoomStyle.js"

const CLOSE_LABEL = "프로필 테두리 확대 보기 닫기"

// item = { icon, label }, 비면 닫힘, 뒤판·닫기·Esc로 닫음 (Esc·뒤판은 취소 소리, 데스크톱과 같음)
export default function BorderZoomModal({ item, onClose }) {
  return (
    <SheetPortal open={Boolean(item)} onClose={onClose}>
      <>
        <motion.button
          key="backdrop"
          type="button"
          aria-label={CLOSE_LABEL}
          data-sfx-kind="ui-cancel"
          className={BACKDROP_CLASS}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={ZOOM_TRANSITION}
          onClick={onClose}
        />
        <div key="wrap" className={WRAP_CLASS}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${item?.label} 프로필 테두리 보기`}
            className={PANEL_CLASS}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={ZOOM_TRANSITION}
            onClick={(event) => event.stopPropagation()}
          >
            <CloseButton
              label={CLOSE_LABEL}
              onClick={onClose}
              src={ZOOM_CLOSE_SRC}
              className={CLOSE_BTN_CLASS}
              iconClassName="block h-auto w-[2.35rem] select-none"
              style={{ outline: "none" }}
            />
            <div className={ILLUSTRATION_WRAP_CLASS}>
              <PublicAsset src={item?.icon} alt={item?.label} className={ILLUSTRATION_CLASS} />
            </div>
            <p className={TITLE_CLASS}>{item?.label}</p>
          </motion.div>
        </div>
      </>
    </SheetPortal>
  )
}
