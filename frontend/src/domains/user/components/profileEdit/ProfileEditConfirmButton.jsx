import { STORE_ASSETS } from "../../../store/constants/storeAssets.js"
import {
  PROFILE_EDIT_CONFIRM_BTN_CLASS,
  PROFILE_EDIT_CONFIRM_BTN_IMAGE_CLASS,
  PROFILE_EDIT_CONFIRM_BTN_LABEL_CLASS,
  PROFILE_EDIT_FOOTER_CLASS,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// F-12(AC-06): disabled는 서버 equip 요청이 진행 중일 때(confirmStatus:"saving") true다 —
// 클릭을 막아 중복 확인(동일 장착 요청 이중 전송)을 방지한다.
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
