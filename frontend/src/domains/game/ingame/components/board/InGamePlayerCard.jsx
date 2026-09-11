import {
  INGAME_PLAYER_ASSETS,
  INGAME_PLAYER_FRAME_IMAGE_CLASS,
  INGAME_PLAYER_FRAME_SHADOW_LAYER_CLASS,
} from "../../constants/board/ingamePlayerAssets.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"
import { buildInGamePlayerCardE2eAttrs } from "../../constants/e2e/ingameE2eHooks.js"
import InGamePlayerFrameStroke from "./InGamePlayerFrameStroke.jsx"
import InGamePlayerNameplate from "./InGamePlayerNameplate.jsx"
import InGamePlayerStatusOverlay from "./status/InGamePlayerStatusOverlay.jsx"
import { resolveInGamePlayerFrameSrc } from "../../utils/pickInGamePlayerFrame.js"
import { resolveInGamePlayerCardThemeStyles } from "../../utils/resolveInGamePlayerCardThemeStyles.js"
import { getPlayerPortraitVariant } from "@/shared/constants/playerPortraitLayout.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/**
 * 인게임 플레이어 카드 — 배경 + 직업 초상 + 상태 UI + 프레임 + 닉네임
 *
 * F-13(AC-05): accountBorderSrc는 frameSrc(직업 스킨/카드 프레임, 역할 정보를 드러내지
 * 않는 장식)와는 별개의 계정 프로필 테두리다 — 초상 inset(PlayerPortraitFrame의
 * "ingameCard" variant)과 같은 자리에만 겹쳐 그려, 카드 바깥 프레임·역할 표시는 전혀
 * 건드리지 않는다. 값이 없으면(계정 테두리를 아직 확보하지 못한 참가자) 아무 것도
 * 그리지 않는다 — 기존 카드 모양 그대로 유지.
 */
export default function InGamePlayerCard({
  portraitSrc,
  frameSrc = INGAME_PLAYER_ASSETS.cardFrame,
  accountBorderSrc = null,
  nickname = "",
  status = INGAME_PLAYER_STATUS.ALIVE,
  theme = null,
  voteHighlight = false,
  isSelf = false,
  className = "",
}) {
  const styles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
  const displayFrameSrc = resolveInGamePlayerFrameSrc(frameSrc, status)
  const accountBorderInset = getPlayerPortraitVariant("ingameCard").portraitInset

  return (
    <div
      className={`relative shrink-0 [container-type:inline-size] ${className}`}
      {...buildInGamePlayerCardE2eAttrs({ nickname, status, isSelf })}
    >
      <div
        className={`relative w-full overflow-visible ${isSelf ? "ring-2 ring-[#f3d28d]/80 ring-offset-2 ring-offset-black/40 rounded-full" : ""}`}
      >
        <PlayerPortraitFrame variant="ingameCard" src={portraitSrc} />
        {accountBorderSrc ? (
          <div
            className="pointer-events-none absolute z-[2] overflow-visible"
            style={accountBorderInset}
            aria-hidden="true"
          >
            <PublicAsset
              src={accountBorderSrc}
              alt=""
              className="absolute inset-0 h-full w-full select-none object-contain"
            />
          </div>
        ) : null}
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
          <InGamePlayerNameplate nickname={nickname} theme={theme} voteHighlight={voteHighlight} />
        ) : null}
      </div>
    </div>
  )
}
