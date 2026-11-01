// 설정 인트로 영상 (소리 없이 자동 재생) + 눌러서 건너뛰기 칸
// pages/SettingPage.jsx가 인트로 끝나기 전까지 씀
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 영상 ref는 데스크톱 useVideoIntro가 끝남·건너뛰기에 씀
export default function SettingIntro({ videoRef, onSkip }) {
    return (
        <>
            <video
                ref={videoRef}
                src={publicAsset(SETTING_ASSETS.bgVideo)}
                autoPlay
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <button
                type="button"
                aria-label="인트로 건너뛰기"
                onClick={onSkip}
                className="absolute inset-0 z-30 cursor-pointer border-0 bg-transparent p-0"
            />
        </>
    )
}
