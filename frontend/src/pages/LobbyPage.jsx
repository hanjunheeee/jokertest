import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LOBBY_ASSETS } from "../assets/lobbyAssets.js"
import FriendListPanel from "../components/lobby/FriendListPanel.jsx"
import MyPageBannerButton from "../components/lobby/MyPageBannerButton.jsx"
import PublicAsset from "../components/login/PublicAsset.jsx"
import { publicAsset } from "../lib/publicAsset.js"

const UI_REVEAL_BEFORE_END_SEC = 1
const VIDEO_HOLD_BEFORE_END_SEC = 0.04
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

const LOBBY_MENU_ITEMS = [
  { id: "gameplay", label: "게임플레이" },
  { id: "settings", label: "설정" },
  { id: "store", label: "상점" },
  { id: "archive", label: "기억의 서고" },
  { id: "exit", label: "종료" },
]

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
  const uiRevealedRef = useRef(false)
  const videoHeldRef = useRef(false)
  const [activeMenu, setActiveMenu] = useState("gameplay")
  const [uiVisible, setUiVisible] = useState(false)
  const [friendListOpen, setFriendListOpen] = useState(false)

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
      <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
        <defs>
          <filter
            id="lobby-menu-noise"
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.78"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 0"
              result="noiseAlpha"
            />
            <feBlend in="SourceGraphic" in2="noiseAlpha" mode="soft-light" />
          </filter>
        </defs>
      </svg>

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

          <nav
            className="mt-[clamp(1.25rem,3.5vh,2.5rem)] flex translate-x-[clamp(0.1rem,1.0vw,-0.1rem)] translate-y-[clamp(1.25rem,3.5vh,2.75rem)] flex-col items-center gap-[clamp(0.85rem,2.2vh,1.35rem)]"
            aria-label="로비 메뉴"
          >
            {LOBBY_MENU_ITEMS.map((item) => {
              const isActive = activeMenu === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveMenu(item.id)
                    if (item.id === "gameplay") navigate("/gameMode")
                    if (item.id === "settings") navigate("/setting")
                  }}
                  className={`lobby-menu-btn cursor-pointer border-0 bg-transparent p-0 ${
                    isActive ? "lobby-menu-btn--active" : "lobby-menu-btn--idle"
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* prototype 우측 배너 래일 — ER/시즌팩 등과 유사한 대형 가로 버튼 스택 */}
        <div className="absolute top-[2.5%] right-[0.5%] z-10 flex flex-col items-stretch gap-[clamp(0.75rem,1.6vh,1.25rem)] sm:top-[3%] sm:right-[1%]">
          <MyPageBannerButton onClick={() => navigate("/mypage")} />
        </div>

        <button
          type="button"
          aria-label="친구 목록"
          aria-expanded={friendListOpen}
          onClick={() => setFriendListOpen(true)}
          className="absolute bottom-[2.5%] right-[2.5%] block w-[clamp(5.25rem,8.5vw,7.25rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:right-[3%]"
        >
          <PublicAsset
            src={LOBBY_ASSETS.friendListButton}
            alt=""
            className="block h-auto w-full select-none"
          />
        </button>
      </motion.div>

      <FriendListPanel
        open={friendListOpen}
        onClose={() => setFriendListOpen(false)}
      />
    </div>
  )
}
