// 마이페이지 틀 그림 버튼 하나 (계정 관리·프로필 수정·스킨 착용·이모티콘)
// 마이페이지 버튼 네 개가 씀
import {
  ACTION_BTN_CLASS,
  ACTION_BTN_IMG_CLASS,
  ACTION_BTN_TEXT_CLASS,
} from "../../constants/myPageLayoutStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 틀 그림 위에 글자
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
