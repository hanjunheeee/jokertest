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

import { fetchMyFriends, fetchIncomingRequests, acceptFriendRequest, declineFriendRequest } from "@/domains/lobby/api/friend.js";

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
  
  const [allFriends, setAllFriends] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])

  // 💡 1. 순수하게 백엔드에서 데이터만 가져오는 함수 (setState 안 씀)
  const fetchFriendsApi = async () => {
    const friendsData = await fetchMyFriends();
    const requestsData = await fetchIncomingRequests();
    return { friendsData, requestsData };
  };

  const handleRefreshFriends = async () => {
    try {
      const { friendsData, requestsData } = await fetchFriendsApi();
      setAllFriends(friendsData);
      setIncomingRequests(requestsData);
    } catch (error) {
      console.error("데이터 로드 실패:", error.message);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      await acceptFriendRequest(requestId);
      const requestsData = await fetchIncomingRequests();
      setIncomingRequests(requestsData);
    } catch (error) {
      console.error("친구 수락 실패:", error.message);
    }
  };

  const handleDeclineRequest = async (requestId) => {
    try {
      await declineFriendRequest(requestId);
      setIncomingRequests(prev => prev.filter(r => r.request_id !== requestId));
    } catch (error) {
      console.error("친구 거절 실패:", error.message);
    }
  };

  const handleAcceptAll = async () => {
    try {
      await Promise.all(incomingRequests.map(r => acceptFriendRequest(r.request_id)));
      setIncomingRequests([]);
    } catch (error) {
      console.error("전체 수락 실패:", error.message);
    }
  };

  // 💡 3. 패널이 열릴 때 자동으로 상태를 갱신 (리액트 공식 권장 패턴 적용!)
  useEffect(() => {
    if (!friendListOpen) return;

    let isMounted = true; // 화면이 열려있는지 확인하는 안전장치

    // .then() 안에서 비동기적으로 상태를 업데이트하므로 린터가 안심합니다.
    fetchFriendsApi()
      .then(({ friendsData, requestsData }) => {
        if (isMounted) {
          setAllFriends(friendsData);
          setIncomingRequests(requestsData);
        }
      })
      .catch((error) => console.error("데이터 로드 실패:", error.message));

    return () => {
      isMounted = false; // 패널이 닫히면 데이터가 와도 무시함 (메모리 누수 방지)
    };
  }, [friendListOpen]);

  // 폴더 규격에 맞게 3등분
  const onlineFriends = allFriends.filter(f => f.online && !f.isFavorite);
  const offlineFriends = allFriends.filter(f => !f.online && !f.isFavorite);
  const favoriteFriends = allFriends.filter(f => f.isFavorite);

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
        onlineFriends={onlineFriends}
        offlineFriends={offlineFriends}
        favoriteFriends={favoriteFriends}
        incomingRequests={incomingRequests}
        onRefreshRequests={handleRefreshFriends}
        onAcceptRequest={handleAcceptRequest}
        onDeclineRequest={handleDeclineRequest}
        onAcceptAll={handleAcceptAll}
      />
    </div>
  )
}