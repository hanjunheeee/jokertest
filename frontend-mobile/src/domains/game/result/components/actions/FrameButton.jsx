// 그림 버튼 위에 글자를 얹은 행동 버튼 (데스크톱 LabelledActionButton 모바일판)
// actions/ResultActions가 씀, 너비는 부모 칸을 나눠 채우고 높이는 44px 이상
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 틀 그림은 늘여서 깔고 글자는 가운데
export default function FrameButton({ src, label, onClick, disabled = false }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            aria-busy={disabled || undefined}
            className="relative flex h-13 min-w-0 flex-1 items-center justify-center transition-transform active:scale-[0.97] disabled:opacity-70 land:h-11 md:h-14"
        >
            <PublicAsset src={src} alt="" className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />
            <span className="relative truncate px-3 font-subheading text-lg font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]" aria-hidden="true">
                {label}
            </span>
        </button>
    )
}
