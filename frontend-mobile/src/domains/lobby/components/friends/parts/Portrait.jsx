// 동그란 프로필 사진 + 테두리 (아이템 id를 그림 경로로 바꿈, 없으면 기본 사진·평민 테두리)
// 친구 시트 줄 틀(RowShell)이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

// 데스크톱 PlayerProfilePortrait와 같은 겹침 (데스크톱 shared/ui는 못 불러 따로 둠)
export default function Portrait({ photoId, borderId, className = "size-12" }) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: photoId,
    accountProfileBorderId: borderId,
  })

  return (
    <div className={`relative shrink-0 select-none ${className}`} aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 z-[1] aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
        <PublicAsset src={portraitSrc} alt="" className="block h-full w-full scale-[1.28] object-cover object-center" />
      </div>
      <PublicAsset
        src={frameSrc}
        alt=""
        className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain"
      />
    </div>
  )
}
