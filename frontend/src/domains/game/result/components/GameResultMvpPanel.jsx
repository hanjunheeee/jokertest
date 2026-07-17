import {
  GAME_RESULT_ASSETS,
  resolveGameResultMvpNameplateFrame,
} from "../constants/gameResultAssets.js"
import {
  GAME_RESULT_FRAME_IMAGE_BLOCK_CLASS,
  GAME_RESULT_FRAME_SHADOW_LAYER_BLOCK_CLASS,
  GAME_RESULT_FRAME_STACK_WRAP_CLASS,
  GAME_RESULT_MVP_NAMEPLATE_LABEL_CLASS,
  GAME_RESULT_MVP_NAMEPLATE_WRAP_CLASS,
  GAME_RESULT_MVP_PANEL_CLASS,
  GAME_RESULT_MVP_PLAYER_NAME_CLASS,
  GAME_RESULT_MVP_PLAYER_NAME_INSET,
  GAME_RESULT_MVP_PORTRAIT_WRAP_CLASS,
  GAME_RESULT_PORTRAIT_FRAME_STACK_CLASS,
} from "../constants/gameResultLayout.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function GameResultMvpPanel({ outcome = "win", mvp }) {
  if (!mvp) return null

  const mvpNameplateFrameSrc = resolveGameResultMvpNameplateFrame(outcome)

  return (
    <aside className={GAME_RESULT_MVP_PANEL_CLASS} aria-label="MVP 플레이어">
      <div className={GAME_RESULT_MVP_NAMEPLATE_WRAP_CLASS}>
        <div className={GAME_RESULT_FRAME_STACK_WRAP_CLASS}>
          <PublicAsset
            src={mvpNameplateFrameSrc}
            alt=""
            aria-hidden="true"
            className={GAME_RESULT_FRAME_SHADOW_LAYER_BLOCK_CLASS}
          />
          <PublicAsset
            src={mvpNameplateFrameSrc}
            alt=""
            className={GAME_RESULT_FRAME_IMAGE_BLOCK_CLASS}
          />
        </div>
        <span className={GAME_RESULT_MVP_NAMEPLATE_LABEL_CLASS}>
          MVP 플레이어
        </span>
      </div>

      <div className={GAME_RESULT_MVP_PORTRAIT_WRAP_CLASS}>
        <div className="relative w-full overflow-visible">
          <PlayerPortraitFrame variant="ingameCard" src={mvp.portraitSrc} />
          <div className={GAME_RESULT_PORTRAIT_FRAME_STACK_CLASS}>
            <PublicAsset
              src={GAME_RESULT_ASSETS.mvpPlayerFrame}
              alt=""
              aria-hidden="true"
              className={GAME_RESULT_FRAME_SHADOW_LAYER_BLOCK_CLASS}
            />
            <PublicAsset
              src={GAME_RESULT_ASSETS.mvpPlayerFrame}
              alt=""
              className={GAME_RESULT_FRAME_IMAGE_BLOCK_CLASS}
            />
          </div>
          {mvp.name ? (
            <p
              className={GAME_RESULT_MVP_PLAYER_NAME_CLASS}
              style={GAME_RESULT_MVP_PLAYER_NAME_INSET}
            >
              <span className="block w-full truncate">{mvp.name}</span>
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
