import {
  INGAME_PLAYER_ASSETS,
  FRAME_IMG_CLASS,
  FRAME_SHADOW_LAYER_CLASS,
} from "../../constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../../shared/constants/ingamePlayerStatus.js"
import { buildPlayerCardE2eAttrs } from "../../constants/e2e/ingameE2eHooks.js"
import InGamePlayerFrameStroke from "./InGamePlayerFrameStroke.jsx"
import InGamePlayerNameplate from "./InGamePlayerNameplate.jsx"
import InGamePlayerStatusOverlay from "./status/InGamePlayerStatusOverlay.jsx"
import { resolveInGamePlayerFrameSrc } from "../../utils/pickInGamePlayerFrame.js"
import { resolveInGamePlayerCardThemeStyles } from "../../utils/resolveInGamePlayerCardThemeStyles.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function InGamePlayerCard({
  portraitSrc,
  frameSrc = INGAME_PLAYER_ASSETS.cardFrame,
  nickname = "",
  status = INGAME_PLAYER_STATUS.ALIVE,
  theme = null,
  voteHighlight = false,
  isSelf = false,
  className = "",
}) {
  const styles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
  const displayFrameSrc = resolveInGamePlayerFrameSrc(frameSrc, status)

  return (
    <div
      className={`relative shrink-0 [container-type:inline-size] ${className}`}
      {...buildPlayerCardE2eAttrs({ nickname, status, isSelf })}
    >
      <div
        className={`relative w-full overflow-visible ${isSelf ? "ring-2 ring-[#f3d28d]/80 ring-offset-2 ring-offset-black/40 rounded-full" : ""}`}
      >
        <PlayerPortraitFrame variant="ingameCard" src={portraitSrc} />
        <InGamePlayerStatusOverlay status={status} />
        {isSelf ? (
          <span
            className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f3d28d] bg-[#3a1a0c] px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-[#ffe2ad] shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            aria-label="본인"
          >
            나
          </span>
        ) : null}

        <div className="relative z-10 w-full overflow-visible">
          {styles ? (
            <InGamePlayerFrameStroke
              frameSrc={displayFrameSrc}
              color={styles.color}
              scale={styles.frameStrokeScale}
            />
          ) : null}
          <PublicAsset
            src={displayFrameSrc}
            alt=""
            className={FRAME_SHADOW_LAYER_CLASS}
            aria-hidden="true"
          />
          <PublicAsset
            src={displayFrameSrc}
            alt=""
            className={FRAME_IMG_CLASS}
          />
        </div>

        {nickname ? (
          <InGamePlayerNameplate nickname={nickname} theme={theme} voteHighlight={voteHighlight} />
        ) : null}
      </div>
    </div>
  )
}
