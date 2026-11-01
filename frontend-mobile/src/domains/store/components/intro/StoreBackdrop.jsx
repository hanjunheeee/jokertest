// 상점 뒤 배경 (입장 영상 → 끝나면 정지 배경 그림, 영상 중엔 눌러서 건너뛰기)
// pages/StorePage가 맨 아래 층에 씀
import { motion } from "framer-motion"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 영상 끝 감지는 페이지의 useVideoIntro가 videoRef로 함 (데스크톱과 같음)
export default function StoreBackdrop({ videoRef, introDone, onSkip }) {
    return (
        <>
            {!introDone ? (
                <video
                    ref={videoRef}
                    src={publicAsset(STORE_ASSETS.entryVideo)}
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                    className="absolute inset-0 z-10 h-full w-full object-cover object-center"
                />
            ) : (
                <motion.img
                    src={publicAsset(STORE_ASSETS.bg)}
                    alt=""
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={BG_FADE_TRANSITION}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
                    draggable={false}
                />
            )}
            {/* 배경 그림이 밝아 위 글자가 묻히지 않게 살짝 어둡게 */}
            {introDone ? <div className="pointer-events-none absolute inset-0 bg-black/30" aria-hidden="true" /> : null}
            {/* 영상 위 투명 건너뛰기 (데스크톱 SettingIntroSkipLayer와 같은 동작) */}
            {!introDone ? (
                <button
                    type="button"
                    aria-label="인트로 건너뛰기"
                    onClick={onSkip}
                    className="absolute inset-0 z-30 cursor-pointer border-0 bg-transparent p-0"
                />
            ) : null}
        </>
    )
}
