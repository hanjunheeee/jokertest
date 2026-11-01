// 그림 버튼 (버튼 그림 위에 글자)
// ActionBar·SaveDoneDialog가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 폭은 부르는 쪽이 정함, 그림 비율상 높이 44px 넘게
export default function ImageButton({ label, src, disabled, onClick, buttonRef, className = "w-[min(42%,10rem)]" }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative block min-h-11 border-0 bg-transparent p-0 leading-none active:scale-95 disabled:opacity-40 ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-base font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
        {label}
      </span>
    </button>
  )
}
