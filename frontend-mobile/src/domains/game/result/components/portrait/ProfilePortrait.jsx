// 동그란 프로필 사진 + 테두리 그림 (안 넘기면 기본 사진·평민 테두리)
// players/PlayerRow가 씀 (데스크톱 shared/ui/PlayerProfilePortrait는 경계 규칙상 못 불러서 모바일판)
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 사진은 틀 안쪽 동그라미에, 테두리는 위에 겹침 (크기는 className으로)
export default function ProfilePortrait({ photoSrc, frameSrc, className = "size-14" }) {
    return (
        <div className={`relative shrink-0 select-none ${className}`}>
            <div className="absolute left-1/2 top-[46%] z-[1] aspect-square w-[67%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
                <PublicAsset
                    src={photoSrc ?? PLAYER_PROFILE_ASSETS.defaultPhoto}
                    alt=""
                    className="block h-full w-full scale-[1.28] select-none object-cover object-center"
                />
            </div>
            <PublicAsset
                src={frameSrc ?? PLAYER_PROFILE_ASSETS.defaultBorder}
                alt=""
                className="pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"
            />
        </div>
    )
}
