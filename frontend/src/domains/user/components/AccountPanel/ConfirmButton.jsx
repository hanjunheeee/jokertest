// 계정 폼 확인(submit) 버튼 (버튼 그림 + 글자)
// 계정 폼 아래 줄·DiscordAccountLink가 씀
import {
  CONFIRM_BTN_CLASS,
  CONFIRM_BTN_IMG_CLASS,
  CONFIRM_BTN_SRC,
  CONFIRM_BTN_TEXT_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 폼 submit 버튼이라 누르면 폼 보내기가 일어남
export default function ConfirmButton({ label, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={CONFIRM_BTN_CLASS}
    >
      <PublicAsset src={CONFIRM_BTN_SRC} alt="" className={CONFIRM_BTN_IMG_CLASS} />

      <span className={CONFIRM_BTN_TEXT_CLASS}>
        {label}
      </span>
    </button>
  )
}
