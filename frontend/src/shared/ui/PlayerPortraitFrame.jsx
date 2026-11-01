// 플레이어 초상 틀 안쪽 (배경 그라데이션 + 초상 그림, 자리 값은 variant별)
// ingame 플레이어 카드와 result MVP 패널이 씀
import { getPortraitVariant } from "../constants/playerPortraitLayout.js"
import PublicAsset from "./PublicAsset.jsx"

// variant 자리 값은 playerPortraitLayout.js, 없는 이름이면 거기서 던짐
export default function PlayerPortraitFrame({
  variant = "ingameCard",
  src,
  portraitClassName = "",
}) {
  const { bgInset, portraitInset, bgGradientClass, portraitImageClass } =
    getPortraitVariant(variant)

  return (
    <>
      {/* 그라데이션 class가 있는 variant만 배경을 깖 */}
      {bgGradientClass ? (
        <div className="absolute z-0 overflow-hidden" style={bgInset}>
          <div className={bgGradientClass} aria-hidden="true" />
        </div>
      ) : null}

      <div className="absolute z-[1] overflow-hidden" style={portraitInset}>
        {/* 초상 주소가 없으면 빈 칸 */}
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
