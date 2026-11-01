// 시트 바닥 확인 줄 (오류 글 + 긍정 그림 버튼)
// WearSheet·ProfileEditSheet가 씀
import {
  CONFIRM_BTN_IMG_CLASS,
  CONFIRM_BTN_LABEL_CLASS,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 착용 창 오류 글 (빨간 글자, 바로 읽어 줌)
const WEAR_ERROR_CLASS = "m-0 text-center font-subheading text-sm text-[#ff6b6b]"

// 버튼 틀: 데스크톱 폭(14rem), 그림 비율로 높이 44px 넘음
const BTN_CLASS =
  "interactive-scale relative block min-h-11 w-[min(100%,14rem)] cursor-pointer border-0 bg-transparent p-0 leading-none land:w-[11rem] disabled:cursor-not-allowed"

// 저장 중엔 잠그고 흐리게(데스크톱 0.6), 소리는 시트 쪽 훅이 직접 냄(data-sfx-owner)
// errorClass·errorRole·ariaLabel로 프로필 편집 창 모양을 따름
export default function ConfirmBar({
  label,
  ariaLabel,
  saving,
  error,
  onConfirm,
  src = SKIN_CARD_WEAR_ASSETS.confirmButton,
  errorClass = WEAR_ERROR_CLASS,
  errorRole = "alert",
  className = "border-[#c9a227]/20 bg-black/70",
}) {
  return (
    <div className={`flex shrink-0 flex-col items-center gap-1.5 border-t px-4 py-2 land:py-1 ${className}`}>
      {error ? (
        <p role={errorRole} aria-live={errorRole === "alert" ? "assertive" : undefined} className={errorClass}>
          {error}
        </p>
      ) : null}
      <button
        type="button"
        data-sfx-owner="explicit"
        onClick={onConfirm}
        disabled={saving}
        aria-label={ariaLabel}
        aria-busy={saving}
        className={BTN_CLASS}
        style={{ outline: "none", opacity: saving ? 0.6 : 1 }}
      >
        <PublicAsset src={src} alt="" className={CONFIRM_BTN_IMG_CLASS} />
        <span className={CONFIRM_BTN_LABEL_CLASS}>{label}</span>
      </button>
    </div>
  )
}
