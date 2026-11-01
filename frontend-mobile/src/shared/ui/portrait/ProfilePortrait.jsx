// 동그란 프로필 사진 + 테두리 그림 (데스크톱 PlayerProfilePortrait와 같은 겹침)
// 결과 참가자 줄·대기방 친구 초대/추방 줄·친구 시트 줄이 씀
import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 사진 동그라미 자리: 가운데 72% / 조금 위 67% (결과 화면 테두리)
const PHOTO_SPOT = {
  center: "top-1/2 w-[72%]",
  raised: "top-[46%] w-[67%]",
}

// 사진·테두리 안 넘기면 기본 그림, 크기는 className, 나머지 props(aria-hidden 등)는 바깥 칸에
export default function ProfilePortrait({ photoSrc, frameSrc, className = "size-12", spot = "center", ...rest }) {
  return (
    <div className={`relative shrink-0 select-none ${className}`} {...rest}>
      <div className={`absolute left-1/2 z-[1] aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ${PHOTO_SPOT[spot]}`}>
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
