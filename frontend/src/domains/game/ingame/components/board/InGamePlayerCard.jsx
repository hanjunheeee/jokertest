import {
  INGAME_PLAYER_THEME_TEXT_RENDER_CLASS,
  resolveInGamePlayerThemeEmphasized,
} from "../../constants/ingamePlayerTheme.js"
import {
  INGAME_PLAYER_ASSETS,
  INGAME_PLAYER_FRAME_IMAGE_CLASS,
  INGAME_PLAYER_FRAME_SHADOW_LAYER_CLASS,
  INGAME_PLAYER_NAMEPLATE_CLASS,
  INGAME_PLAYER_NAMEPLATE_INSET,
} from "../../constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"
import InGamePlayerFrameStroke from "./InGamePlayerFrameStroke.jsx"
import InGamePlayerStatusOverlay from "./status/InGamePlayerStatusOverlay.jsx"
import { resolveInGamePlayerFrameSrc } from "../../utils/pickInGamePlayerFrame.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/**
 * 인게임 플레이어 카드 — 배경 + 직업 초상 + 상태 UI + 프레임 + 닉네임
 */
export default function InGamePlayerCard({
  portraitSrc,
  frameSrc = INGAME_PLAYER_ASSETS.cardFrame,
  nickname = "",
  status = INGAME_PLAYER_STATUS.ALIVE,
  theme = null,
  /** 투표 선택 등 — 프레임 stroke 강화 (추후 투표 UI에서 사용) */
  voteHighlight = false,
  /** 인증된 uuid 동등성으로 판정된 본인 여부 — "나" 배지와 절제된 강조 테두리를 켠다 */
  isSelf = false,
  className = "",
}) {
  const styles =
    theme && voteHighlight
      ? resolveInGamePlayerThemeEmphasized(theme.paletteIndex).styles
      : theme?.styles

  const nameplateStyle = styles
    ? {
        ...INGAME_PLAYER_NAMEPLATE_INSET,
        color: styles.color,
      }
    : INGAME_PLAYER_NAMEPLATE_INSET

  const displayFrameSrc = resolveInGamePlayerFrameSrc(frameSrc, status)

  return (
    <div
      className={`relative shrink-0 [container-type:inline-size] ${className}`}
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
            className={INGAME_PLAYER_FRAME_SHADOW_LAYER_CLASS}
            aria-hidden="true"
          />
          <PublicAsset
            src={displayFrameSrc}
            alt=""
            className={INGAME_PLAYER_FRAME_IMAGE_CLASS}
          />
        </div>

        {nickname ? (
          <p
            className={`${INGAME_PLAYER_NAMEPLATE_CLASS} ${styles ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : ""}`.trim()}
            style={nameplateStyle}
          >
            <span className="block w-full truncate">{nickname}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
