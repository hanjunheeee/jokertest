// 암살 영상 창: 투명 합성 캔버스 + 숨긴 원본 영상 + 아래 글 한 줄, 자동 재생 막히면 화면 눌러 다시 재생·건너뛰기
// 낮 시작 연출 창(DawnReportOverlay)이 살해당한 사람이 있을 때 띄움, 재생·끝 알림은 데스크톱 useNightSuccessKillVideo
import { useNightSuccessKillVideo } from "@/domains/game/ingame/hooks/useNightSuccessKillVideo.js"
import {
    HIDDEN_VIDEO_STYLE,
    STACKED_CANVAS_CLASS,
} from "@/domains/game/ingame/utils/ingameStackedAlphaPlayback.js"
import {
    INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR,
    INGAME_KILL_REVEAL_SKIP_LABEL,
    REVEAL_BACKDROP_CLASS,
    REVEAL_PANEL_WRAP_CLASS,
} from "@/domains/game/ingame/constants/ingameKillReveal.js"
import { DAWN_MSG_CLASS, SKIP_BTN_CLASS } from "../overlayText.js"

// 캔버스는 데스크톱 모양 그대로 (영상 양쪽 끝까지 인물이 있어 잘라내지 않음, 폭 92vw)
// eventId = 연출 열쇠(바뀌면 처음부터), message = 영상 아래 글 (어두운 덮개 위 밝은 글자)
export default function KillVideo({ eventId, src, finish, message = null }) {
    const {
        videoRef, canvasRef, status, handleEnded, handleError, handleSkip, handleRetry,
    } = useNightSuccessKillVideo({ eventId, src, finish })

    return (
        <div className={REVEAL_BACKDROP_CLASS} data-ingame-night-success-kill="">
            <div className={REVEAL_PANEL_WRAP_CLASS}>
                <canvas ref={canvasRef} className={STACKED_CANVAS_CLASS} data-ingame-night-success-canvas="" />
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
                {message ? (
                    <p className={DAWN_MSG_CLASS} role="status" data-ingame-dawn-report-message="">{message}</p>
                ) : null}
                {/* 자동 재생이 막히면 화면 전체를 눌러 다시 재생 (데스크톱처럼 안내 글 없음) */}
                {status === "retry" ? (
                    <>
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="화면을 눌러 다시 재생"
                            {...{ [INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR]: "" }}
                            onClick={handleRetry}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") handleRetry()
                            }}
                            className="absolute inset-0 cursor-pointer"
                        />
                        <button type="button" className={SKIP_BTN_CLASS} onClick={handleSkip}>
                            {INGAME_KILL_REVEAL_SKIP_LABEL}
                        </button>
                    </>
                ) : null}
                {/* 시간 안에 안 끝나면 건너뛰기만 */}
                {status === "watchdog" ? (
                    <button type="button" className={SKIP_BTN_CLASS} onClick={handleSkip}>
                        {INGAME_KILL_REVEAL_SKIP_LABEL}
                    </button>
                ) : null}
            </div>
        </div>
    )
}
