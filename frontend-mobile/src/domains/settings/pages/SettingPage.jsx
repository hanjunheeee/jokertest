// 설정 화면 (/setting): 인트로 영상 → 양피지 배경 + 위 줄·탭·설정 목록, 바닥 줄은 배경음 조절
// app/routes/index.jsx가 씀
import { useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import BgmControl from "../components/controls/BgmControl.jsx"
import SettingContent from "../components/layout/SettingContent.jsx"
import SettingIntro from "../components/layout/SettingIntro.jsx"
import SettingTabs from "../components/layout/SettingTabs.jsx"
import SettingTopBar from "../components/layout/SettingTopBar.jsx"

// 인트로가 끝나거나 건너뛰면 설정 UI가 떠오름 (데스크톱과 같은 흐름)
export default function SettingPage() {
    const navigate = useNavigate()
    const { bgVideoRef, introDone, skipIntro } = useVideoIntro()
    const [activeTab, setActiveTab] = useState("general")

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
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
                    draggable={false}
                />
            ) : null}

            {introDone ? (
                <motion.div
                    className="relative z-10 flex min-h-0 flex-1 flex-col"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={UI_REVEAL_TRANSITION}
                >
                    {/* 폰 가로는 높이가 모자라서 위 줄과 탭을 한 줄로 */}
                    <div className="flex shrink-0 flex-col land:flex-row land:items-center land:[&_h1]:hidden">
                        <SettingTopBar onBack={() => navigate("/lobby")} />
                        <div className="land:flex-1 land:pr-14">
                            <SettingTabs activeTab={activeTab} onSelect={setActiveTab} />
                        </div>
                    </div>
                    <SettingContent activeTab={activeTab} />
                    {/* 세로는 배경이 높이에 맞춰져 아래 나무 띠가 늘 10% → 글이 그 위로 안 내려가게 비움
                        (가로는 폭에 맞춰져 띠가 잘려 나감) */}
                    <div className="shrink-0 basis-[9%] land:basis-0" aria-hidden="true" />
                </motion.div>
            ) : null}

            {/* 바닥 줄: 데스크톱 오른쪽 아래 배경음 조절 자리 */}
            {introDone ? (
                <ShellBottom>
                    <div className="flex h-14 items-center justify-end border-t border-[#c4a574]/30 bg-[linear-gradient(#2a1d14,#140c08)] px-3 land:h-12">
                        <BgmControl />
                    </div>
                </ShellBottom>
            ) : null}
        </div>
    )
}
