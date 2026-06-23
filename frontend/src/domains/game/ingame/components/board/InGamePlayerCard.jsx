import {
  INGAME_PLAYER_ASSETS,
  INGAME_PLAYER_PORTRAIT_BG_INSET,
  INGAME_PLAYER_PORTRAIT_INSET,
} from "../../constants/ingamePlayerAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 전신 PNG — 프레임 안 상반신만 보이도록 확대·상단 정렬 */
const PORTRAIT_IMAGE_CLASS =
  "absolute top-0 left-1/2 h-[225%] w-[128%] -translate-x-1/2 object-cover object-[center_5%]"

/**
 * 인게임 플레이어 카드 — 배경 + 직업 초상 + 프레임 + 이름표
 */
export default function InGamePlayerCard({
  portraitSrc,
  className = "",
}) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative w-full overflow-hidden">
        <div
          className="absolute z-0 overflow-hidden"
          style={INGAME_PLAYER_PORTRAIT_BG_INSET}
        >
          <div
            className="absolute inset-0 bg-gradient-to-b from-[#ddd2bc] via-[#cfc3aa] to-[#bfb39a]"
            aria-hidden="true"
          />
        </div>

        <div
          className="absolute z-[1] overflow-hidden"
          style={INGAME_PLAYER_PORTRAIT_INSET}
        >
          {portraitSrc ? (
            <PublicAsset
              src={portraitSrc}
              alt=""
              className={PORTRAIT_IMAGE_CLASS}
            />
          ) : null}
        </div>

        <PublicAsset
          src={INGAME_PLAYER_ASSETS.cardFrame}
          alt=""
          className="relative z-10 block h-auto w-full select-none"
        />
      </div>

      <PublicAsset
        src={INGAME_PLAYER_ASSETS.nameplate}
        alt=""
        className="mt-[0.18em] block h-auto w-[90%] select-none"
      />
    </div>
  )
}
