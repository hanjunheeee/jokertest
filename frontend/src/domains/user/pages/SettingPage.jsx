import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import SettingPanel from "@/domains/user/components/SettingPanel.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { SETTING_ASSETS } from "../constants/settingAssets.js"
import { publicAsset } from "@/shared/utils/publicAsset"

const VIDEO_HOLD_BEFORE_END_SEC = 0.04
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

function holdOnLastFrame(video) {
  const { duration, currentTime } = video
  if (!duration || !Number.isFinite(duration)) {
    video.pause()
    return
  }
  const target = Math.max(0, duration - 0.001)
  if (currentTime < target - 0.02) {
    video.currentTime = target
  }
  video.pause()
}

export default function SettingPage() {
  const navigate = useNavigate()
  const bgVideoRef = useRef(null)
  const videoHeldRef = useRef(false)
  const [introDone, setIntroDone] = useState(false)

  const holdVideo = () => {
    const video = bgVideoRef.current
    if (!video || videoHeldRef.current) return
    videoHeldRef.current = true
    holdOnLastFrame(video)
    setIntroDone(true)
  }

  const skipIntro = () => {
    if (videoHeldRef.current) return
    holdVideo()
  }

  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return

    const syncPlayback = () => {
      const { duration, currentTime } = video
      if (!duration || !Number.isFinite(duration)) return

      const remaining = duration - currentTime

      if (!videoHeldRef.current && remaining <= VIDEO_HOLD_BEFORE_END_SEC) {
        holdVideo()
      }
    }

    const onEnded = () => {
      holdVideo()
    }

    video.addEventListener("timeupdate", syncPlayback)
    video.addEventListener("loadedmetadata", syncPlayback)
    video.addEventListener("ended", onEnded)
    syncPlayback()

    return () => {
      video.removeEventListener("timeupdate", syncPlayback)
      video.removeEventListener("loadedmetadata", syncPlayback)
      video.removeEventListener("ended", onEnded)
    }
  }, [])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <video
        ref={bgVideoRef}
        src={publicAsset(SETTING_ASSETS.bgVideo)}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {!introDone ? (
        <button
          type="button"
          aria-label="인트로 건너뛰기"
          onClick={skipIntro}
          className="absolute inset-0 z-30 cursor-pointer border-0 bg-transparent p-0"
        />
      ) : null}

      <SettingPanel visible={introDone} />

      <motion.button
        type="button"
        aria-label="뒤로 가기"
        initial={{ opacity: 0, y: 8 }}
        animate={
          introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }
        }
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/lobby")}
        className="absolute bottom-[2.5%] left-[2.5%] z-30 block w-[clamp(4.75rem,7.5vw,6.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:left-[3%]"
        style={{ pointerEvents: introDone ? "auto" : "none" }}
      >
        <PublicAsset
          src={SETTING_ASSETS.backButton}
          alt=""
          className="block h-auto w-full select-none"
        />
      </motion.button>
    </div>
  )
}
