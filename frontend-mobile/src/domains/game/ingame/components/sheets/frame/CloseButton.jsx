// 시트 닫기 그림 버튼 (데스크톱 옆 창 닫기 그림 그대로)
// sheets/frame/Sheet.jsx·Modal.jsx가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { CLOSE_BTN_CLASS, CLOSE_BUTTON_SRC, CLOSE_IMG_CLASS } from "./sheetStyle.js"

// 누르면 취소 소리(data-sfx-kind)
export default function CloseButton({ label, onClose }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClose}
      data-sfx-kind="ui-cancel"
      className={CLOSE_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={CLOSE_BUTTON_SRC} alt="" className={CLOSE_IMG_CLASS} />
    </button>
  )
}
