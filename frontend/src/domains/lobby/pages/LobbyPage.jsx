import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LOBBY_ASSETS } from "../constants/lobbyAssets.js"
import { BGM_ASSETS } from "@/shared/constants/bgmAssets.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import FriendListPanel from "@/domains/lobby/components/friendList/FriendListPanel.jsx"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"
import LobbyMenuNav from "@/domains/lobby/components/LobbyMenuNav.jsx"
import MyPageBannerButton from "@/domains/user/components/MyPageBannerButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { publicAsset } from "@/shared/utils/publicAsset.js"

import { useFriendStore } from "../store/friendStore.js"

const UI_REVEAL_BEFORE_END_SEC = 1
const VIDEO_HOLD_BEFORE_END_SEC = 0.04
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

function shouldRevealUi(video) {
  const { duration, currentTime } = video
  if (!duration || !Number.isFinite(duration)) return false
  return currentTime >= Math.max(0, duration - UI_REVEAL_BEFORE_END_SEC)
}

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

export default function LobbyPage() {
  const navigate = useNavigate()
  const bgVideoRef = useRef(null)
  const audioRef = useRef(null)
  const uiRevealedRef = useRef(false)
  const videoHeldRef = useRef(false)
  const [uiVisible, setUiVisible] = useState(false)
  const [friendListOpen, setFriendListOpen] = useState(false)
  
  const fetchFriends = useFriendStore((state) => state.fetchFriends)

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const revealUi = () => {
    if (uiRevealedRef.current) return
    uiRevealedRef.current = true
    setUiVisible(true)
  }

  const holdVideo = () => {
    const video = bgVideoRef.current
    if (!video || videoHeldRef.current) return
    videoHeldRef.current = true
    holdOnLastFrame(video)
  }

  const skipIntro = () => {
    if (uiRevealedRef.current) return

    revealUi()

    const video = bgVideoRef.current
    if (!video) return

    if (video.duration && Number.isFinite(video.duration)) {
      holdVideo()
      return
    }

    const onMetadata = () => {
      video.removeEventListener("loadedmetadata", onMetadata)
      holdVideo()
    }
    video.addEventListener("loadedmetadata", onMetadata)
  }

  useEffect(() => {
    const playBgm = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {})
      }
    }

    playBgm()
    window.addEventListener("click", playBgm, { once: true })

    return () => window.removeEventListener("click", playBgm)
  }, [])

  useEffect(() => {
    const video = bgVideoRef.current
    if (!video) return

    const syncPlayback = () => {
      const { duration, currentTime } = video
      if (!duration || !Number.isFinite(duration)) return

      const remaining = duration - currentTime

      if (shouldRevealUi(video)) revealUi()

      if (!videoHeldRef.current && remaining <= VIDEO_HOLD_BEFORE_END_SEC) {
        holdVideo()
      }
    }

    const onEnded = () => {
      revealUi()
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
      <audio ref={audioRef} src={publicAsset(BGM_ASSETS.loginMusic)} loop />
      <video
        ref={bgVideoRef}
        src={publicAsset(LOBBY_ASSETS.bgVideo)}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {!uiVisible ? (
        <button
          type="button"
          aria-label="인트로 건너뛰기"
          onClick={skipIntro}
          className="absolute inset-0 z-20 cursor-pointer border-0 bg-transparent p-0"
        />
      ) : null}

      <motion.div
        className="absolute inset-0 z-10"
        initial={{ opacity: 0, y: 10 }}
        animate={
          uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
        }
        transition={UI_REVEAL_TRANSITION}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      >
        <aside className="absolute left-[7.5%] top-[6%] flex flex-col items-center sm:left-[8%] sm:top-[6.5%]">
          <PublicAsset
            src={LOBBY_ASSETS.logo}
            alt="The Joker"
            className="pointer-events-none h-auto w-[clamp(14rem,27vw,28rem)] translate-y-[clamp(0.4rem,1.2vh,0.9rem)] select-none"
          />

          <LobbyMenuNav />
        </aside>

        {/* prototype 우측 배너 래일 — ER/시즌팩 등과 유사한 대형 가로 버튼 스택 */}
        <div className="absolute top-[2.5%] right-[0.5%] z-10 flex flex-col items-stretch gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:top-[3%] sm:right-[1%]">
          <MyPageBannerButton onClick={() => navigate("/mypage")} />
        </div>

        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:bottom-6 sm:right-6 ">
          <FriendListToggleButton
            open={friendListOpen}
            onOpen={() => setFriendListOpen(true)}
          />
          <SoundControl audioRef={audioRef} />
        </div>
      </motion.div>

      <FriendListPanel
        open={friendListOpen}
        onClose={() => setFriendListOpen(false)}
      />
    </div>
  )
}
