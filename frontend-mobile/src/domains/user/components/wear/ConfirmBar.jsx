// 시트 바닥 확인 줄 (오류 글 + 긍정 그림 버튼)
// WearSheet·ProfileEditSheet가 씀
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 저장 중엔 잠금(aria-busy), 소리는 시트 쪽 훅이 직접 냄(data-sfx-owner)
export default function ConfirmBar({ label, saving, error, onConfirm, className = "border-[#c9a227]/20 bg-black/70" }) {
  return (
    <div className={`flex shrink-0 flex-col items-center gap-1.5 border-t px-4 py-2 land:py-1 ${className}`}>
      {error ? (
        <p role="alert" aria-live="assertive" className="m-0 text-center font-subheading text-sm text-[#ff6b6b]">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        data-sfx-owner="explicit"
        onClick={onConfirm}
        disabled={saving}
        aria-busy={saving}
        className="relative block min-h-11 w-[min(100%,14rem)] border-0 land:w-[11rem] bg-transparent p-0 leading-none active:scale-95 disabled:opacity-60"
      >
        <PublicAsset src={SKIN_CARD_WEAR_ASSETS.confirmButton} alt="" className="block h-auto w-full select-none" />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-base font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
          {label}
        </span>
      </button>
    </div>
  )
}
