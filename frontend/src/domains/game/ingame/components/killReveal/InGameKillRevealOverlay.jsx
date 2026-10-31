import {
  INGAME_KILL_ANIMATION_VIDEO_URL,
  INGAME_KILL_REVEAL_BACKDROP_CLASS,
  INGAME_KILL_REVEAL_CANVAS_CLASS,
  INGAME_KILL_REVEAL_MESSAGE_CLASS,
  INGAME_KILL_REVEAL_PANEL_WRAP_CLASS,
} from "../../constants/killReveal/ingameKillReveal.js"
import InGameStackedAlphaVideo from "../video/InGameStackedAlphaVideo.jsx"

export default function InGameKillRevealOverlay({ open, revealId, message, onConsume }) {
  const active = Boolean(open) && typeof revealId === "string" && revealId.length > 0

  if (!active) return null

  return (
    <div className={INGAME_KILL_REVEAL_BACKDROP_CLASS} data-ingame-kill-reveal={revealId}>
      <div className={INGAME_KILL_REVEAL_PANEL_WRAP_CLASS}>
        <InGameStackedAlphaVideo
          playbackKey={revealId}
          src={INGAME_KILL_ANIMATION_VIDEO_URL}
          canvasClassName={INGAME_KILL_REVEAL_CANVAS_CLASS}
          sourceVideoDataAttr="data-ingame-kill-reveal-source-video"
          onFinished={() => onConsume?.(revealId)}
        />
        {message ? <p className={INGAME_KILL_REVEAL_MESSAGE_CLASS}>{message}</p> : null}
      </div>
    </div>
  )
}
