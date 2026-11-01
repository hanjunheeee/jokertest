// 재판 추방 연출 창: 추방 영상 → 어두워짐 → "[닉네임]님이 … 추방당하셨습니다" 문구
// OverlayLayer가 씀, 차례는 useInGameTribunalExpulsionPresentation, 단계는 useExpulsionPlayback (덮개·글 모양은 데스크톱 상수)
import {
    FADE_LAYER_CLASS,
    FADE_MS,
    MSG_CLASS,
    VIDEO_URL,
} from "@/domains/game/ingame/constants/ingameTribunalExpulsionPresentation.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { useExpulsionPlayback } from "../../hooks/overlays/useExpulsionPlayback.js"

// 데스크톱 BACKDROP_CLASS 짙기(78%)·여백, body로 꺼내서 absolute 대신 fixed
const BACKDROP_CLASS = "fixed inset-0 z-[70] flex items-center justify-center bg-black/78 px-4 safe-pt safe-pb"

// 세로 폰은 가운데 4:3만 크게 보임 (얼굴·끌려가는 사람·양옆 경비·문이 영상 가로 12~88% 안이라 안 잘림)
// 가로 폰·태블릿은 데스크톱처럼 다 보임
const VIDEO_WRAP_CLASS =
    "relative aspect-[4/3] w-full max-h-[80svh] overflow-hidden md:aspect-video md:w-[min(80vw,64rem)] land:aspect-video land:h-[80svh] land:w-auto"

// 문구 단계에서만 화면 눌러 바로 끝내기
export default function ExpulsionOverlay({ open = false, presentationId = null, message = null, onComplete = null }) {
    const active = Boolean(open) && typeof presentationId === "string" && presentationId.length > 0
    const { videoRef, phase, fadeOpacity, finish, handleEnded, handleError } =
        useExpulsionPlayback({ active, presentationId, onComplete })

    if (!active) return null

    return (
        <div
            className={BACKDROP_CLASS}
            data-ingame-tribunal-expulsion={presentationId}
            data-expulsion-phase={phase}
            onClick={phase === "message" ? finish : undefined}
            role="presentation"
        >
            {phase !== "message" ? (
                <div className={VIDEO_WRAP_CLASS}>
                    <video
                        ref={videoRef}
                        key={presentationId}
                        className="absolute inset-0 block h-full w-full object-cover object-center"
                        src={publicAsset(VIDEO_URL)}
                        playsInline
                        muted
                        preload="auto"
                        onEnded={handleEnded}
                        onError={handleError}
                    />
                    <div
                        className={FADE_LAYER_CLASS}
                        style={{ opacity: fadeOpacity, transitionDuration: `${FADE_MS}ms` }}
                        aria-hidden="true"
                    />
                </div>
            ) : (
                <p className={MSG_CLASS}>{message}</p>
            )}
        </div>
    )
}
