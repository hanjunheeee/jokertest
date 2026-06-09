import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  MULTIPLAY_ENTRY_ASSETS,
  MULTIPLAY_OPTIONS,
} from "../constants/multiplayEntryAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

const UI_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: "beforeChildren",
      staggerChildren: 0.1,
      delayChildren: 0.12,
    },
  },
}

const UI_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: UI_REVEAL_TRANSITION,
  },
}

const NAV_ROW_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      when: "beforeChildren",
      staggerChildren: 0.08,
    },
  },
}

const CARD_ROW_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      when: "beforeChildren",
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
}

const ICON_BTN_CLASS =
  "block w-[clamp(2.85rem,4.8vw,4.1rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

function IconButton({ src, label, onClick, className = "", variants }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      variants={variants}
      className={`${ICON_BTN_CLASS} ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
    </motion.button>
  )
}

function MultiplayOptionCard({ option, variants, onSelect }) {
  return (
    <motion.button
      type="button"
      aria-label={option.label}
      variants={variants}
      onClick={() => onSelect?.(option.id)}
      className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]"
    >
      <PublicAsset
        src={option.frame}
        alt={option.label}
        className="pointer-events-none mx-auto block h-auto w-full max-w-[clamp(13rem,24vw,20.5rem)] select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      />
    </motion.button>
  )
}

/** prototype 게임모드 선택창-멀티플레이 선택.png — GameModePage와 동일 레이아웃 */
export default function MultiplayEntryPage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible] = useState(false)

  const handleOptionSelect = (optionId) => {
    if (optionId === "create") {
      navigate("/game-setup")
      return
    }
    if (optionId === "find") {
      // TODO: 게임 찾기
    }
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(MULTIPLAY_ENTRY_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <motion.div
        className="absolute inset-0 z-10"
        initial="hidden"
        animate={uiVisible ? "visible" : "hidden"}
        variants={UI_CONTAINER_VARIANTS}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      >
        <motion.nav
          variants={NAV_ROW_VARIANTS}
          className="absolute right-[2.5%] top-[2.5%] flex items-center gap-[clamp(0.35rem,0.9vw,0.65rem)] sm:right-[3%] sm:top-[3%]"
          aria-label="멀티플레이 유틸리티"
        >
          <IconButton
            src={MULTIPLAY_ENTRY_ASSETS.settingsButton}
            label="설정"
            variants={UI_ITEM_VARIANTS}
          />
          <IconButton
            src={MULTIPLAY_ENTRY_ASSETS.micButton}
            label="마이크"
            variants={UI_ITEM_VARIANTS}
          />
          <IconButton
            src={MULTIPLAY_ENTRY_ASSETS.menuButton}
            label="메뉴"
            variants={UI_ITEM_VARIANTS}
          />
        </motion.nav>

        <motion.div
          variants={UI_ITEM_VARIANTS}
          className="absolute inset-x-0 top-[12%] bottom-[10%] flex items-center justify-center px-[clamp(1rem,4vw,3rem)] sm:top-[11%] sm:bottom-[9%]"
          role="group"
          aria-label="멀티플레이 옵션 선택"
        >
          <motion.div
            variants={CARD_ROW_VARIANTS}
            className="flex w-full max-w-[min(52rem,88vw)] items-stretch justify-center gap-[clamp(1rem,3vw,2.5rem)]"
          >
            {MULTIPLAY_OPTIONS.map((option) => (
              <MultiplayOptionCard
                key={option.id}
                option={option}
                variants={UI_ITEM_VARIANTS}
                onSelect={handleOptionSelect}
              />
            ))}
          </motion.div>
        </motion.div>

        <motion.button
          type="button"
          aria-label="게임 모드 선택으로 돌아가기"
          variants={UI_ITEM_VARIANTS}
          onClick={() => navigate("/gameMode")}
          className="absolute bottom-[2.5%] left-[2.5%] block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
        >
          <PublicAsset
            src={MULTIPLAY_ENTRY_ASSETS.backButton}
            alt=""
            className="block h-auto w-full select-none"
          />
        </motion.button>
      </motion.div>
    </div>
  )
}
