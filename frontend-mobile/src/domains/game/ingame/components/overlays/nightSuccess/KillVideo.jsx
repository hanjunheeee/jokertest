// 밤 성공 영상 창: 투명 합성 캔버스 + 숨긴 원본 영상, 자동 재생 막히면 화면 눌러 다시 재생·건너뛰기
// 밤 성공 연출 창(NightSuccessOverlay)이 영상 자료 있을 때 띄움, 재생·끝 알림은 데스크톱 useNightSuccessKillVideo
import { useNightSuccessKillVideo } from "@/domains/game/ingame/hooks/useNightSuccessKillVideo.js"
import { HIDDEN_VIDEO_STYLE } from "@/domains/game/ingame/constants/ingameNightSuccess.js"
import {
    INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR,
    INGAME_KILL_REVEAL_SKIP_LABEL,
} from "@/domains/game/ingame/constants/ingameKillReveal.js"
import { SKIP_BTN_CLASS } from "../overlayText.js"

// 영상은 가로형(16:9)이고 인물이 가운데·가장자리는 투명 → 세로에선 가운데를 정사각으로 잘라 크게 보임
// 가로 폰·태블릿은 잘라내지 않고 화면 안에 다 들어오게
const CANVAS_CLASS =
    "aspect-square w-[min(100vw,70svh)] object-cover object-center md:aspect-video md:w-[min(92vw,48rem)] md:object-contain land:aspect-video land:h-[82svh] land:w-auto land:object-contain"

// 이름은 Kill이지만 치료·조사·확인 영상도 여기서 (재생·끝 알림은 훅이 맡음)
export default function KillVideo({ eventId, src, finish }) {
    const {
        videoRef, canvasRef, status, handleEnded, handleError, handleSkip, handleRetry,
    } = useNightSuccessKillVideo({ eventId, src, finish })

    return (
        <div className="fixed inset-0 z-[70] bg-black/92" data-ingame-night-success-kill="">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-hidden safe-pt safe-pb">
                <canvas ref={canvasRef} className={CANVAS_CLASS} data-ingame-night-success-canvas="" />
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
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") handleRetry()
                            }}
                            className="absolute inset-0 flex cursor-pointer items-start justify-center pt-[12svh]"
                        >
                            <span className="rounded bg-black/60 px-4 py-2 text-sm text-[#f8ead2]">화면을 눌러 다시 재생</span>
                        </div>
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
