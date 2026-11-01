// 결과 화면 MVP 칸: 명찰 틀·초상화 틀·이름
// GameResultShell이 씀
import {
  GAME_RESULT_ASSETS,
  resolveMvpNameplateFrame,
} from "../constants/gameResultAssets.js"
import {
  FRAME_IMG_BLOCK_CLASS,
  FRAME_SHADOW_LAYER_BLOCK_CLASS,
  FRAME_STACK_WRAP_CLASS,
  MVP_NAMEPLATE_LABEL_CLASS,
  MVP_NAMEPLATE_WRAP_CLASS,
  MVP_PANEL_CLASS,
  MVP_PLAYER_NAME_CLASS,
  MVP_PLAYER_NAME_INSET,
  MVP_PORTRAIT_WRAP_CLASS,
  PORTRAIT_FRAME_STACK_CLASS,
} from "../constants/gameResultLayout.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// MVP 칸 (명찰 틀은 승패 따라 바뀜)
export default function GameResultMvpPanel({ outcome = "win", mvp }) {
  // MVP 없으면 안 그림
  if (!mvp) return null

  const mvpNameplateFrameSrc = resolveMvpNameplateFrame(outcome)

  return (
    <aside className={MVP_PANEL_CLASS} aria-label="MVP 플레이어">
      <div className={MVP_NAMEPLATE_WRAP_CLASS}>
        <div className={FRAME_STACK_WRAP_CLASS}>
          <PublicAsset
            src={mvpNameplateFrameSrc}
            alt=""
            aria-hidden="true"
            className={FRAME_SHADOW_LAYER_BLOCK_CLASS}
          />
          <PublicAsset
            src={mvpNameplateFrameSrc}
            alt=""
            className={FRAME_IMG_BLOCK_CLASS}
          />
        </div>
        <span className={MVP_NAMEPLATE_LABEL_CLASS}>
          MVP 플레이어
        </span>
      </div>

      <div className={MVP_PORTRAIT_WRAP_CLASS}>
        <div className="relative w-full overflow-visible">
          <PlayerPortraitFrame variant="ingameCard" src={mvp.portraitSrc} />
          <div className={PORTRAIT_FRAME_STACK_CLASS}>
            <PublicAsset
              src={GAME_RESULT_ASSETS.mvpPlayerFrame}
              alt=""
              aria-hidden="true"
              className={FRAME_SHADOW_LAYER_BLOCK_CLASS}
            />
            <PublicAsset
              src={GAME_RESULT_ASSETS.mvpPlayerFrame}
              alt=""
              className={FRAME_IMG_BLOCK_CLASS}
            />
          </div>
          {/* 이름 있을 때만 */}
          {mvp.name ? (
            <p
              className={MVP_PLAYER_NAME_CLASS}
              style={MVP_PLAYER_NAME_INSET}
            >
              <span className="block w-full truncate">{mvp.name}</span>
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
