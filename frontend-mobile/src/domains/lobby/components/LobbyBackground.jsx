// 로비 배경 (정지 그림 + 첫 진입 영상 + 영상 건너뛰기 칸)
// LobbyPage가 맨 아래 층에 그림
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// fixed라 화면 틀 전체(노치·바닥 줄 뒤까지)를 덮음, 가로 그림은 가운데 기준으로 잘라 채움
const LAYER_CLASS = "pointer-events-none fixed inset-0 h-full w-full object-cover object-center"

// UI가 보이면 영상을 숨기고, 보이기 전엔 화면 전체가 건너뛰기 버튼
export default function LobbyBackground({ bgVideoRef, uiVisible, onSkipIntro }) {
    return (
        <>
            <PublicAsset src={LOBBY_ASSETS.bgImage} alt="" aria-hidden="true" className={`${LAYER_CLASS} z-0`} />
            <video
                ref={bgVideoRef}
                src={publicAsset(LOBBY_ASSETS.bgVideo)}
                autoPlay
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                className={`${LAYER_CLASS} z-[1] transition-opacity duration-500 ${uiVisible ? "opacity-0" : ""}`}
            />
            {/* 글자 대비용 위·아래 어둡게 (영상 끝난 뒤에만) */}
            {uiVisible ? (
                <div
                    aria-hidden="true"
                    className="pointer-events-none fixed inset-0 z-[2] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0)_22%,rgba(0,0,0,0)_70%,rgba(0,0,0,0.6)_100%)]"
                />
            ) : (
                <button
                    type="button"
                    aria-label="인트로 건너뛰기"
                    onClick={onSkipIntro}
                    className="fixed inset-0 z-20 cursor-pointer border-0 bg-transparent p-0"
                />
            )}
        </>
    )
}
