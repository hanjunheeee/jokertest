// 재판 추방 연출 창: 추방 영상 → 어두워짐 → "[닉네임]님이 … 추방당하셨습니다" 문구
// OverlayLayer가 씀, 차례는 useInGameTribunalExpulsionPresentation, 단계는 useExpulsionPlayback
import {
    FADE_MS,
    VIDEO_URL,
} from "@/domains/game/ingame/constants/ingameTribunalExpulsionPresentation.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { useExpulsionPlayback } from "../../hooks/overlays/useExpulsionPlayback.js"
import { DARK_MSG_CLASS } from "./overlayText.js"

// 영상은 가로형 얼굴 클로즈업 → 세로에선 가운데를 3:4로 잘라 화면을 채움 (얼굴이 가운데라 안 잘림)
// 가로 폰·태블릿은 잘라내지 않고 화면 안에 다 들어오게
const VIDEO_WRAP_CLASS =
    "relative aspect-[3/4] w-[min(100vw,75svh)] overflow-hidden md:aspect-video md:w-[min(88vw,52rem)] land:aspect-video land:h-[86svh] land:w-auto"

// 문구 단계에서만 화면 눌러 바로 끝내기
export default function ExpulsionOverlay({ open = false, presentationId = null, message = null, onComplete = null }) {
    const active = Boolean(open) && typeof presentationId === "string" && presentationId.length > 0
    const { videoRef, phase, fadeOpacity, finish, handleEnded, handleError } =
        useExpulsionPlayback({ active, presentationId, onComplete })

    if (!active) return null

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 safe-pt safe-pb"
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
                        className="pointer-events-none absolute inset-0 bg-black transition-opacity ease-out"
                        style={{ opacity: fadeOpacity, transitionDuration: `${FADE_MS}ms` }}
                        aria-hidden="true"
                    />
                </div>
            ) : (
                <p className={DARK_MSG_CLASS} role="status">{message}</p>
            )}
        </div>
    )
}
