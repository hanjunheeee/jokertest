// 설정 화면 (/setting): 인트로 영상 → 양피지 배경 + 탭·설정 목록, 뒤로는 shell 하단
// app/routes/index.jsx가 씀
import { useCallback, useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { SETTING_BG_LAYER_CLASS } from "@m/domains/settings/constants/settingBackgroundStyle.js"
import { MOBILE_SOUND_BAR_HIDDEN } from "@m/shared/constants/mobileSoundUi.js"
import { useShellBackButton } from "@m/shared/layouts/mobileShellBack.jsx"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import BgmControl from "../components/controls/BgmControl.jsx"
import SettingContent from "../components/layout/SettingContent.jsx"
import SettingIntro from "../components/layout/SettingIntro.jsx"
import SettingTabs from "../components/layout/SettingTabs.jsx"
import {
    SETTING_BELOW_BACK_CLASS,
    SETTING_UI_TOP_OFFSET_CLASS,
} from "../constants/settingMobileLayout.js"

// 인트로가 끝나거나 건너뛰면 설정 UI가 떠오름 (데스크톱과 같은 흐름)
export default function SettingPage() {
    const navigate = useNavigate()
    const { bgVideoRef, introDone, skipIntro } = useVideoIntro()
    const [activeTab, setActiveTab] = useState("general")

    const goLobby = useCallback(() => {
        navigate("/lobby")
    }, [navigate])

    useShellBackButton({ onClick: goLobby, label: "설정에서 뒤로", enabled: introDone })

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
            {!introDone ? <SettingIntro videoRef={bgVideoRef} onSkip={skipIntro} /> : null}

            {/* 인트로 끝나면 멈춘 배경 그림으로 바꿈 */}
            {introDone ? (
                <motion.img
                    src={publicAsset(SETTING_ASSETS.bg)}
                    alt=""
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={BG_FADE_TRANSITION}
                    className={SETTING_BG_LAYER_CLASS}
                    draggable={false}
                />
            ) : null}

            {introDone ? (
                <motion.div
                    className={`relative z-10 flex min-h-0 flex-1 flex-col ${SETTING_UI_TOP_OFFSET_CLASS}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={UI_REVEAL_TRANSITION}
                >
                    <div className={SETTING_BELOW_BACK_CLASS}>
                        <SettingTabs activeTab={activeTab} onSelect={setActiveTab} />
                        <SettingContent activeTab={activeTab} />
                    </div>
                </motion.div>
            ) : null}

            {/* 바닥 줄: 데스크톱 오른쪽 아래 배경음 조절 자리 */}
            {introDone && !MOBILE_SOUND_BAR_HIDDEN ? (
                <ShellBottom>
                    <div className="flex h-14 w-full items-center justify-start border-t border-[#c4a574]/30 bg-[linear-gradient(#2a1d14,#140c08)] px-1 land:h-12">
                        <BgmControl />
                    </div>
                </ShellBottom>
            ) : null}
        </div>
    )
}
