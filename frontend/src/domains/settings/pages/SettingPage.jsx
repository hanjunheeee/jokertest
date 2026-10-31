import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import SettingBackButton from "@/domains/settings/components/SettingBackButton.jsx"
import SettingBackground from "@/domains/settings/components/SettingBackground.jsx"
import SettingIntroSkipLayer from "@/domains/settings/components/SettingIntroSkipLayer.jsx"
import SettingPanel from "@/domains/settings/components/SettingPanel.jsx"
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"

export default function SettingPage() {
  const navigate = useNavigate()

  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
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

      <SettingIntroSkipLayer visible={!introDone} onSkip={skipIntro} />
      <SettingPanel visible={introDone} />
      <SettingBackButton visible={introDone} onBack={() => navigate("/lobby")} />
      <PageSoundControlArea visible={introDone} />
    </div>
  )
}
