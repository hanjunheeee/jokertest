// 결과 화면 들어갈 때 승리/패배 연출 영상 (화면 전체 덮개), 재생 막히면 건너뛰기 버튼
// pages/GameResultPage가 씀, 끝나거나 건너뛰면 onComplete
import { useEffect, useRef, useState } from "react"
import { resolveGameResultIntroVideo } from "@/domains/game/result/constants/gameResultAssets.js"
import { FALLBACK_TIMEOUT_MS, SKIP_LABEL } from "@/domains/game/result/constants/gameResultIntro.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

const SKIP_BTN_CLASS =
    "absolute left-1/2 z-20 min-h-11 min-w-32 -translate-x-1/2 rounded border border-[#d8b982] bg-[#2b1c15] px-6 py-2 font-subheading text-base font-semibold tracking-wide text-[#f8ead2] active:bg-[#53321f]"

// 연출 영상 (소리 없이 자동 재생, 폰 세로면 가운데를 잘라 채움)
export default function IntroVideo({ outcome = "win", onComplete }) {
    const videoRef = useRef(null)
    const [showSkip, setShowSkip] = useState(false)

    // 승패 바뀔 때마다 처음부터 다시 재생, 거절·20초 지남이면 건너뛰기 보임 (데스크톱과 같음)
    useEffect(() => {
        let cancelled = false
        const video = videoRef.current
        if (video) {
            try {
                video.pause()
                video.currentTime = 0
            } catch {
                // 멈춤·되감기 실패는 무시하고 재생은 시도함
            }
            const playResult = video.play()
            if (playResult && typeof playResult.then === "function") {
                playResult.catch(() => {
                    if (!cancelled) setShowSkip(true)
                })
            }
        }
        const watchdog = setTimeout(() => {
            if (!cancelled) setShowSkip(true)
        }, FALLBACK_TIMEOUT_MS)
        return () => {
            cancelled = true
            clearTimeout(watchdog)
            setShowSkip(false)
        }
    }, [outcome])

    return (
        <div className="fixed inset-0 z-50 bg-black" data-game-result-intro={outcome}>
            <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover object-center"
                src={publicAsset(resolveGameResultIntroVideo(outcome))}
                autoPlay
                muted
                playsInline
                preload="auto"
                onEnded={onComplete}
                onError={() => setShowSkip(true)}
            />
            {/* 건너뛰기는 재생 실패·오류·20초 지남일 때만, 홈 막대 위로 */}
            {showSkip ? (
                <button
                    type="button"
                    className={SKIP_BTN_CLASS}
                    style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
                    onClick={onComplete}
                >
                    {SKIP_LABEL}
                </button>
            ) : null}
        </div>
    )
}
