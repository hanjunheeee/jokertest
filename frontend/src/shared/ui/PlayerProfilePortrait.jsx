import { PLAYER_PROFILE_ASSETS } from "@/shared/constants/playerProfileAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const DEFAULT_WRAP_CLASS = "relative aspect-square shrink-0 select-none"

const DEFAULT_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-1/2 z-[1] aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

const DEFAULT_PHOTO_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.28] select-none object-cover object-center"

const DEFAULT_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"

/** shopItem 프로필 프레임 + 프로필 사진을 겹쳐 표시합니다. */
export default function PlayerProfilePortrait({
  photoSrc: photoSrcProp,
  frameSrc: frameSrcProp,
  wrapClassName = DEFAULT_WRAP_CLASS,
  photoWrapClassName = DEFAULT_PHOTO_WRAP_CLASS,
  photoClassName = DEFAULT_PHOTO_CLASS,
  frameClassName = DEFAULT_FRAME_CLASS,
}) {
  const photoSrc = photoSrcProp ?? PLAYER_PROFILE_ASSETS.defaultPhoto
  const frameSrc = frameSrcProp ?? PLAYER_PROFILE_ASSETS.defaultBorder

  return (
    <div className={wrapClassName}>
      <div className={photoWrapClassName}>
        <PublicAsset src={photoSrc} alt="" className={photoClassName} />
      </div>
      <PublicAsset src={frameSrc} alt="" className={frameClassName} />
    </div>
  )
}
