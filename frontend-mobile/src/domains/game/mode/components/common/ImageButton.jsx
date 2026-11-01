// 그림 버튼 위에 글자를 얹은 버튼 (방 만들기·입장하기·취소·참여하기 등)
// 모드 영역 페이지·바닥 줄이 씀, 폭은 className으로 받고 높이는 그림 비율대로
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 그림 버튼 (잠기면 흐리게·회색)
export default function ImageButton({
  src,
  label,
  onClick,
  disabled = false,
  ariaLabel,
  sfxKind,
  className = "",
  labelClassName = "[--app-text-size:1.05rem]",
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={onClick}
      data-sfx-kind={sfxKind}
      className={`relative block min-h-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-[transform,opacity] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:active:scale-100 ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center px-2 font-subheading app-text-scaled font-bold tracking-wide leading-none text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] ${labelClassName}`}
        aria-hidden="true"
      >
        {label}
      </span>
    </button>
  )
}
