// 인게임 카드 모양 초상 (초상 그림 + 카드 틀 + 아래 이름)
// board/MvpCard가 씀 (데스크톱 shared/ui/PlayerPortraitFrame ingameCard 자리 값을 그대로 씀)
import { getPortraitVariant } from "@/shared/constants/playerPortraitLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const SHADOW_CLASS =
    "[filter:drop-shadow(0_6px_14px_rgba(0,0,0,0.8))]"

// 카드 초상 (너비는 className으로, 높이는 틀 그림 비율)
export default function CardPortrait({ portraitSrc, frameSrc, name, className = "w-32" }) {
    const { portraitInset, portraitImageClass } = getPortraitVariant("ingameCard")

    return (
        <div className={`relative shrink-0 ${className}`}>
            <div className="absolute z-0 overflow-hidden" style={portraitInset}>
                {portraitSrc ? <PublicAsset src={portraitSrc} alt="" className={portraitImageClass} /> : null}
            </div>
            <PublicAsset src={frameSrc} alt="" className={`relative z-[1] block h-auto w-full select-none ${SHADOW_CLASS}`} />
            {/* 이름은 틀 아래 이름 칸에 (데스크톱 MVP 이름 자리와 같음) */}
            {name ? (
                <p
                    className="pointer-events-none absolute z-[2] flex items-center justify-center overflow-hidden px-[6%] text-center font-display text-lg font-medium leading-none text-black"
                    style={{ bottom: "3.1%", left: "11%", right: "11%", height: "15%" }}
                >
                    <span className="block w-full truncate">{name}</span>
                </p>
            ) : null}
        </div>
    )
}
