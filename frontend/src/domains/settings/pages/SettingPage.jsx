// 설정 화면 (/setting): 인트로 영상 → 배경 그림 + 설정 창·뒤로 버튼·소리 조절
// app/routes/index.jsx가 씀
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import SettingBackButton from "@/domains/settings/components/SettingBackButton.jsx"
import SettingBackground from "@/domains/settings/components/SettingBackground.jsx"
import SettingIntroSkipLayer from "@/shared/ui/SettingIntroSkipLayer.jsx"
import SettingPanel from "@/domains/settings/components/SettingPanel.jsx"
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"

// 인트로 영상이 끝나거나 건너뛰면 설정 창이 나타남
export default function SettingPage() {
  const navigate = useNavigate()

  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* 인트로 동안은 영상, 끝나면 멈춘 배경 그림으로 바꿈 */}
      {!introDone ? <SettingBackground videoRef={bgVideoRef} /> : null}

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

      {/* 인트로 동안 화면 누르면 건너뜀 */}
      <SettingIntroSkipLayer visible={!introDone} onSkip={skipIntro} />
      <SettingPanel visible={introDone} />
      {/* 뒤로 가기는 로비로 */}
      <SettingBackButton visible={introDone} onBack={() => navigate("/lobby")} />
      <PageSoundControlArea visible={introDone} />
    </div>
  )
}
