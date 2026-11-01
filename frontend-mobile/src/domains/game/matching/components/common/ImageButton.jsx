// 그림 버튼 하나 (수락·취소 그림을 버튼 크기에 맞춰 늘리고 글자 겹침)
// 대기방 바닥 줄·시트 버튼(복사·저장·취소·추방·초대·확인)이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { IMAGE_BTN_LABEL_CLASS } from "../../constants/matchingMobileStyles.js"

// 높이 44px 이상, 그림은 버튼 칸을 꽉 채움 (가로 그림이라 살짝 늘어나도 티 안 남)
export default function ImageButton({
  label,
  src,
  onClick,
  disabled = false,
  ariaLabel,
  busy = false,
  sfxKind,
  className = "",
  labelClassName = IMAGE_BTN_LABEL_CLASS,
  testId,
  describedBy,
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-busy={busy || undefined}
      aria-describedby={describedBy}
      onClick={onClick}
      disabled={disabled}
      data-sfx-kind={sfxKind}
      data-testid={testId}
      className={`relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <PublicAsset
        src={src}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
      />
      <span className={`${labelClassName} truncate`} aria-hidden="true">
        {label}
      </span>
    </button>
  )
}
