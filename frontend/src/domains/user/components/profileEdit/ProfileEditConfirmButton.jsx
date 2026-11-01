import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  PROFILE_EDIT_CONFIRM_BTN_CLASS,
  PROFILE_EDIT_CONFIRM_BTN_IMAGE_CLASS,
  PROFILE_EDIT_CONFIRM_BTN_LABEL_CLASS,
  PROFILE_EDIT_FOOTER_CLASS,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function ProfileEditConfirmButton({ onClick, disabled = false }) {
  return (
    <footer className={PROFILE_EDIT_FOOTER_CLASS}>
      <button
        type="button"
        className={PROFILE_EDIT_CONFIRM_BTN_CLASS}
        style={{ outline: "none", opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}
        aria-label="수정하기"
        aria-busy={disabled}
        disabled={disabled}
        data-sfx-owner="explicit"
        onClick={onClick}
      >
        <PublicAsset
          src={STORE_ASSETS.purchaseButton}
          alt=""
          className={PROFILE_EDIT_CONFIRM_BTN_IMAGE_CLASS}
        />
        <span className={PROFILE_EDIT_CONFIRM_BTN_LABEL_CLASS}>{disabled ? "저장 중…" : "수정하기"}</span>
      </button>
    </footer>
  )
}
