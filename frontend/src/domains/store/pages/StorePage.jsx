import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import SettingIntroSkipLayer from "@/shared/ui/SettingIntroSkipLayer.jsx"
import { useVideoIntro } from "@/shared/hooks/useVideoIntro.js"
import PageSoundControlArea from "@/shared/ui/PageBackgroundMusic.jsx"
import StoreEntryBackground from "../components/StoreEntryBackground.jsx"
import StorePanel from "../components/panel/StorePanel.jsx"
import StoreCurrencyBalance from "../components/StoreCurrencyBalance.jsx"
import { STORE_ASSETS } from "../../../shared/constants/storeAssets.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"

export default function StorePage() {
  const navigate = useNavigate()
  const { bgVideoRef, introDone, skipIntro } = useVideoIntro()
  const balanceGold = useEconomyStore((state) => state.balanceGold)
  const balanceDiamond = useEconomyStore((state) => state.balanceDiamond)
  const economyStatus = useEconomyStore((state) => state.status)
  const retryEconomySummary = useEconomyStore((state) => state.retry)

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {!introDone ? <StoreEntryBackground videoRef={bgVideoRef} /> : null}

      {introDone ? (
        <motion.img
          src={publicAsset(STORE_ASSETS.bg)}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={BG_FADE_TRANSITION}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          draggable={false}
        />
      ) : null}

      <SettingIntroSkipLayer visible={!introDone} onSkip={skipIntro} />
      <StoreCurrencyBalance
        visible={introDone}
        balanceGold={balanceGold}
        balanceDiamond={balanceDiamond}
        status={economyStatus}
        onRetry={retryEconomySummary}
      />
      <StorePanel visible={introDone} />

      <MotionBackButton
        initial={{ opacity: 0, y: 8 }}
        animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/lobby")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: introDone ? "auto" : "none" }}
      />
      <PageSoundControlArea visible={introDone} />
    </div>
  )
}
