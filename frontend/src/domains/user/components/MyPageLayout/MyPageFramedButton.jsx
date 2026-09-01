import {
  MY_PAGE_ACTION_BUTTON_CLASS,
  MY_PAGE_ACTION_BUTTON_IMG_CLASS,
  MY_PAGE_ACTION_BUTTON_TEXT_CLASS,
} from "@/domains/user/constants/myPageLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function MyPageFramedButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={MY_PAGE_ACTION_BUTTON_CLASS}
    >
      <PublicAsset src="/button/버튼 프레임1.png" alt="" className={MY_PAGE_ACTION_BUTTON_IMG_CLASS} />
      <span className={MY_PAGE_ACTION_BUTTON_TEXT_CLASS}>{label}</span>
    </button>
  )
}
