import {
  MY_PAGE_ACCOUNT_BUTTON_CLASS,
  MY_PAGE_ACCOUNT_BUTTON_IMG_CLASS,
  MY_PAGE_ACCOUNT_BUTTON_TEXT_CLASS,
} from "@/domains/user/constants/myPageLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function AccountManageButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={MY_PAGE_ACCOUNT_BUTTON_CLASS}
    >
      {/* 버튼 배경 프레임 이미지입니다. */}
      <PublicAsset src="/button/버튼 프레임1.png" alt="" className={MY_PAGE_ACCOUNT_BUTTON_IMG_CLASS} />

      {/* 실제 버튼 글자입니다. 이미지를 눌러도 버튼이 눌리게 텍스트는 클릭을 막지 않습니다. */}
      <span className={MY_PAGE_ACCOUNT_BUTTON_TEXT_CLASS}>
        계정 관리
      </span>
    </button>
  )
}
