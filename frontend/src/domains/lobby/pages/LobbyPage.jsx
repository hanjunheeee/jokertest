/**
 * 로비 페이지.
 *
 * page 계층은 훅·컴포넌트 조합과 네비게이션 제어만 담당합니다.
 * - 인트로 영상·BGM 제어 → useLobbyIntro
 * - 친구 목록 데이터 동기화·핸들러 → useFriendListSync
 * - 화면 조각 → LobbyMenuNav, FriendListPanel, FriendListToggleButton, MyPageBannerButton
 */
import { motion } from "framer-motion"
import { useState } from "react"
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
import { useLobbyIntro } from "../hooks/useLobbyIntro.js"
import { useFriendListSync } from "../hooks/useFriendListSync.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

export default function LobbyPage() {
  const navigate = useNavigate()
  const [friendListOpen, setFriendListOpen] = useState(false) // 친구 목록 패널 열림 여부

  // 영상·BGM 인트로 타이밍 제어 — bgVideoRef·audioRef는 훅 내부에서 관리
  const { bgVideoRef, audioRef, uiVisible, skipIntro } = useLobbyIntro()

  // 패널 열림 여부(friendListOpen)를 기준으로 데이터 동기화 및 친구 액션 핸들러 제공
  const {
    onlineFriends,
    offlineFriends,
    favoriteFriends,
    incomingRequests,
    handleRefreshFriends,
    handleAcceptRequest,
    handleDeclineRequest,
    handleAcceptAll,
  } = useFriendListSync(friendListOpen)

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* 오디오·비디오 ref는 useLobbyIntro가 직접 제어 */}
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

      {/* 인트로가 끝나기 전에만 렌더 — 클릭 시 skipIntro 호출 */}
      {!uiVisible ? (
        <button
          type="button"
          aria-label="인트로 건너뛰기"
          onClick={skipIntro}
          className="absolute inset-0 z-20 cursor-pointer border-0 bg-transparent p-0"
        />
      ) : null}

      {/* uiVisible이 true가 되면 메뉴·버튼 전체가 페이드인 */}
      <motion.div
        className="absolute inset-0 z-10"
        initial={{ opacity: 0, y: 10 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={UI_REVEAL_TRANSITION}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }} // 인트로 중 클릭 차단
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
            onOpen={() => setFriendListOpen(true)} // 패널 열기 — useFriendListSync가 초기 동기화 수행
          />
          <SoundControl audioRef={audioRef} />
        </div>
      </motion.div>

      {/* 패널은 motion.div 밖에 위치 — uiVisible과 무관하게 독립적으로 열고 닫힘 */}
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
