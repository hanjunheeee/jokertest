import { STORE_ASSETS } from "@/domains/store/constants/storeAssets.js"
import {
  PROFILE_EDIT_CONFIRM_BTN_CLASS,
  PROFILE_EDIT_CONFIRM_BTN_IMAGE_CLASS,
  PROFILE_EDIT_CONFIRM_BTN_LABEL_CLASS,
  PROFILE_EDIT_FOOTER_CLASS,
} from "@/domains/user/constants/profileEditLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function ProfileEditConfirmButton({ onClick }) {
  return (
    <footer className={PROFILE_EDIT_FOOTER_CLASS}>
      <button
        type="button"
        className={PROFILE_EDIT_CONFIRM_BTN_CLASS}
        style={{ outline: "none" }}
        aria-label="수정하기"
        onClick={onClick}
      >
        <PublicAsset
          src={STORE_ASSETS.purchaseButton}
          alt=""
          className={PROFILE_EDIT_CONFIRM_BTN_IMAGE_CLASS}
        />
        <span className={PROFILE_EDIT_CONFIRM_BTN_LABEL_CLASS}>수정하기</span>
      </button>
    </footer>
  )
}
