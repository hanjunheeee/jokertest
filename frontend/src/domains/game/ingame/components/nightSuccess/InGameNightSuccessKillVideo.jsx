// 밤 성공 사망 영상: 합친 그림 캔버스와 숨긴 원본 영상, 막혔을 때 다시 재생·건너뛰기
// 밤 성공 연출(InGameNightSuccessPresentation)이 영상 자료가 있을 때 띄움, 재생은 useNightSuccessKillVideo
import { useNightSuccessKillVideo } from "../../hooks/useNightSuccessKillVideo.js"
import {
  HIDDEN_VIDEO_STYLE,
  ROLE_VIDEO_CLASS,
} from "../../constants/ingameNightSuccess.js"
import {
  REVEAL_BACKDROP_CLASS,
  REVEAL_PANEL_WRAP_CLASS,
  INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR,
  REVEAL_SKIP_BTN_CLASS,
  INGAME_KILL_REVEAL_SKIP_LABEL,
} from "../../constants/ingameKillReveal.js"

export default function InGameNightSuccessKillVideo({ eventId, src, finish }) {
  const {
    videoRef, canvasRef, status, handleEnded, handleError, handleSkip, handleRetry,
  } = useNightSuccessKillVideo({ eventId, src, finish })

  return (
    <div className={REVEAL_BACKDROP_CLASS} data-ingame-night-success-kill="">
      <div className={REVEAL_PANEL_WRAP_CLASS}>
        <canvas
          ref={canvasRef}
          className={ROLE_VIDEO_CLASS}
          data-ingame-night-success-canvas=""
        />
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          onEnded={handleEnded}
          onError={handleError}
          style={HIDDEN_VIDEO_STYLE}
          aria-hidden="true"
          data-ingame-night-success-source-video=""
        />
        {/* 자동 재생이 막히면 화면 전체를 눌러 다시 재생 */}
        {status === "retry" ? (
          <>
            <div
              role="button"
              tabIndex={0}
              aria-label="화면을 눌러 다시 재생"
              {...{ [INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR]: "" }}
              onClick={handleRetry}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleRetry() }}
              className="absolute inset-0 cursor-pointer"
            />
            <button type="button" className={`${REVEAL_SKIP_BTN_CLASS} relative z-10`} onClick={handleSkip}>
              {INGAME_KILL_REVEAL_SKIP_LABEL}
            </button>
          </>
        ) : null}
        {/* 시간 안에 안 끝나면 건너뛰기만 */}
        {status === "watchdog" ? (
          <button type="button" className={REVEAL_SKIP_BTN_CLASS} onClick={handleSkip}>
            {INGAME_KILL_REVEAL_SKIP_LABEL}
          </button>
        ) : null}
      </div>
    </div>
  )
}
