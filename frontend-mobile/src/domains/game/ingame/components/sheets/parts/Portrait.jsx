// 동그란 프로필 사진 + 테두리 그림 (데스크톱 PlayerProfilePortrait와 같은 겹침)
// 추방 줄·기록 줄이 씀, 데스크톱 shared/ui는 못 불러서 따로 둠
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"

// 사진·테두리 안 넘기면 기본 그림
export default function Portrait({ photoSrc, frameSrc, className = "h-12 w-12" }) {
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
