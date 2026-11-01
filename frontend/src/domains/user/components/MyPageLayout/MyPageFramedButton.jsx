import {
  ACTION_BTN_CLASS,
  ACTION_BTN_IMG_CLASS,
  ACTION_BTN_TEXT_CLASS,
} from "../../constants/myPageLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function MyPageFramedButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={ACTION_BTN_CLASS}
    >
      <PublicAsset src="/button/버튼 프레임1.png" alt="" className={ACTION_BTN_IMG_CLASS} />
      <span className={ACTION_BTN_TEXT_CLASS}>{label}</span>
    </button>
  )
}
