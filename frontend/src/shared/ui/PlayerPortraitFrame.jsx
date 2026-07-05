import { getPlayerPortraitVariant } from "../constants/playerPortraitLayout.js"
import PublicAsset from "./PublicAsset.jsx"

/**
 * Player Portrait Mask — 배경 + 초상 클리핑 영역.
 *
 * 겉 장식 프레임 PNG는 부모(InGamePlayerCard 등)에서 별도로 올립니다.
 */
export default function PlayerPortraitFrame({
  variant = "ingameCard",
  src,
  portraitClassName = "",
}) {
  const { bgInset, portraitInset, bgGradientClass, portraitImageClass } =
    getPlayerPortraitVariant(variant)

  return (
    <>
      <div className="absolute z-0 overflow-hidden" style={bgInset}>
        <div className={bgGradientClass} aria-hidden="true" />
      </div>

      <div className="absolute z-[1] overflow-hidden" style={portraitInset}>
        {src ? (
          <PublicAsset
            src={src}
            alt=""
            className={`${portraitImageClass} ${portraitClassName}`.trim()}
          />
        ) : null}
      </div>
    </>
  )
}
