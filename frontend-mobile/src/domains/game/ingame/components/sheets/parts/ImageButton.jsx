// 그림 버튼 하나 (버튼 그림을 칸에 맞춰 늘리고 글자 겹침, 높이 44px 이상)
// 탭 줄·방 코드 버튼·추방 줄·추방 확인·복사 버튼이 씀 (matching ImageButton 복사본)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 그림 버튼과 같은 흰 글자·그림자
const LABEL_CLASS =
  "relative z-[1] truncate px-2 font-subheading app-text-scaled [--app-text-size:0.92rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// pressed를 주면 탭처럼 aria-pressed로 알림
export default function ImageButton({
  label,
  src,
  onClick,
  disabled = false,
  ariaLabel,
  pressed,
  sfxKind,
  className = "",
  labelClassName = "",
  testId,
  describedBy,
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      aria-describedby={describedBy}
      onClick={onClick}
      disabled={disabled}
      data-sfx-kind={sfxKind}
      data-testid={testId}
      className={`relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={src}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
      />
      <span className={`${LABEL_CLASS} ${labelClassName}`} aria-hidden="true">
        {label}
      </span>
    </button>
  )
}
