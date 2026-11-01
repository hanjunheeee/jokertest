// 플레이어 카드 미리보기 (초상 + 카드 틀 + 닉네임 판)
// Preview가 씀
import { INGAME_PLAYER_NAMEPLATE_INSET } from "@/domains/game/ingame/constants/board/ingamePlayerAssets.js"
import { getPortraitVariant } from "@/shared/constants/playerPortraitLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 InGamePlayerCard는 화면 부품이라 못 불러서 같은 자리 값(초상 inset·이름판 inset)으로 다시 그림
export default function PreviewCard({ portraitSrc, frameSrc, nickname }) {
  const { portraitInset, portraitImageClass } = getPortraitVariant("ingameCard")

  return (
    <div className="relative w-full [container-type:inline-size] [filter:drop-shadow(0_0_8px_rgba(0,0,0,0.78))_drop-shadow(0_10px_18px_rgba(0,0,0,0.52))]">
      <div className="absolute z-[1] overflow-hidden" style={portraitInset}>
        {portraitSrc ? <PublicAsset src={portraitSrc} alt="" className={portraitImageClass} /> : null}
      </div>
      {frameSrc ? (
        <PublicAsset src={frameSrc} alt="" className="relative z-10 block h-auto w-full select-none" />
      ) : null}
      {nickname ? (
        <p
          className="pointer-events-none absolute z-[11] flex items-center justify-center overflow-hidden px-[6%] text-center font-subheading text-[clamp(0.875rem,9cqi,1.3rem)] font-bold leading-none tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
          style={INGAME_PLAYER_NAMEPLATE_INSET}
        >
          <span className="block w-full truncate">{nickname}</span>
        </p>
      ) : null}
    </div>
  )
}
