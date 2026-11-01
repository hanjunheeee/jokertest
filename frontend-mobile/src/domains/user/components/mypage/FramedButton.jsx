// 틀 그림 버튼 하나 (계정 관리·프로필 수정·스킨&카드 착용·이모티콘)
// MyPageActions가 씀, 데스크톱 MyPageFramedButton 그림

import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const FRAME_SRC = "/button/버튼 프레임1.png"

// 그림은 칸에 맞춰 늘림 (높이 44px 이상 보장)
export default function FramedButton({ label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="relative block h-12 w-full cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.97]"
        >
            <PublicAsset src={FRAME_SRC} alt="" className="absolute inset-0 block h-full w-full select-none" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-2 font-subheading text-[0.95rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
                {label}
            </span>
        </button>
    )
}
