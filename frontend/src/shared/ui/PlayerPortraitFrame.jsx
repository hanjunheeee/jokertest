import { getPlayerPortraitVariant } from "../constants/playerPortraitLayout.js"
import PublicAsset from "./PublicAsset.jsx"

export default function PlayerPortraitFrame({
  variant = "ingameCard", // playerPortraitLayout.js의 PLAYER_PORTRAIT_VARIANTS 키 — 배경/초상 inset·클리핑 방식을 결정
  src,
  portraitClassName = "",
}) {
  const { bgInset, portraitInset, bgGradientClass, portraitImageClass } =
    getPlayerPortraitVariant(variant)

  return (
    <>
      {bgGradientClass ? (
        <div className="absolute z-0 overflow-hidden" style={bgInset}>
          <div className={bgGradientClass} aria-hidden="true" />
        </div>
      ) : null}

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
