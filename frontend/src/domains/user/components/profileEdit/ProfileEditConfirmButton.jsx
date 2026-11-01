import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  CONFIRM_BTN_CLASS,
  CONFIRM_BTN_IMG_CLASS,
  CONFIRM_BTN_LABEL_CLASS,
  FOOTER_CLASS,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function ProfileEditConfirmButton({ onClick, disabled = false }) {
  return (
    <footer className={FOOTER_CLASS}>
      <button
        type="button"
        className={CONFIRM_BTN_CLASS}
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
          className={CONFIRM_BTN_IMG_CLASS}
        />
        <span className={CONFIRM_BTN_LABEL_CLASS}>{disabled ? "저장 중…" : "수정하기"}</span>
      </button>
    </footer>
  )
}
