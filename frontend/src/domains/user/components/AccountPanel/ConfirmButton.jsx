import {
  ACCOUNT_PANEL_CONFIRM_BTN_CLASS,
  ACCOUNT_PANEL_CONFIRM_BTN_IMG_CLASS,
  ACCOUNT_PANEL_CONFIRM_BTN_SRC,
  ACCOUNT_PANEL_CONFIRM_BTN_TEXT_CLASS,
} from "@/domains/user/constants/accountPanelStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function ConfirmButton({ label, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={ACCOUNT_PANEL_CONFIRM_BTN_CLASS}
    >
      {/* 확인 버튼 배경 이미지입니다. */}
      <PublicAsset src={ACCOUNT_PANEL_CONFIRM_BTN_SRC} alt="" className={ACCOUNT_PANEL_CONFIRM_BTN_IMG_CLASS} />

      {/* 버튼 이미지 위에 얹는 글자입니다. */}
      <span className={ACCOUNT_PANEL_CONFIRM_BTN_TEXT_CLASS}>
        {label}
      </span>
    </button>
  )
}
