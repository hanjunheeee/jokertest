/**
 * 멀티플레이 매칭 대기 화면 (prototype: 매칭 팝업)
 * GameSetupPage에서 "게임 만들기" 후 진입
 *
 * - 뒤로가기 → /game-setup
 * - 방코드 보기 → RoomCodeViewModal (현재 MATCHING_ROOM_CODE_DUMMY 표시)
 * - 파티 슬롯·인원·방코드는 constants 더미 데이터 (미구현 TODO: 매칭·방 API 연동)
 *
 * UI 구성: MatchingPopupPanel(매칭 프레임·슬롯·액션), RoomCodeViewModal,
 *          파티 인원 헤더(좌상단), SoundControl(우하단), MotionBackButton(좌하단), 배경 이미지
 * 에셋·더미·카피는 constants/gameMatchingAssets.js, 스타일은 matchingPopupStyles.js 참고
 */
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import MatchingPopupPanel from "../components/MatchingPopupPanel.jsx"
import RoomCodeViewModal from "../components/RoomCodeViewModal.jsx"
import {
  GAME_MATCHING_ASSETS,
  MATCHING_PARTY_SLOTS_DUMMY_10,
  MATCHING_POPUP_COPY,
  MATCHING_ROOM_CODE_DUMMY,
} from "../constants/gameMatchingAssets.js"
import {
  MATCHING_PARTY_COUNT_CLASS,
  MATCHING_PARTY_HEADER_CLASS,
  MATCHING_PARTY_ICON_CLASS,
  MATCHING_PARTY_TEXT_CLASS,
} from "../constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  BACK_BUTTON_PAGE_POSITION_CLASS,
  MotionBackButton,
} from "@/shared/ui/BackButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset"

const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

/** 배경·매칭 패널·방코드 모달·파티 헤더·공통 UI를 묶는 매칭 대기 페이지 */
export default function GameMatchingPage() {
  const navigate = useNavigate()
  const [uiVisible, setUiVisible] = useState(false) // true면 패널·헤더·뒤로가기 입장 연출 및 클릭 허용
  const [roomCodeOpen, setRoomCodeOpen] = useState(false) // 방코드 읽기 전용 모달 표시 여부
  const partyCount = MATCHING_PARTY_SLOTS_DUMMY_10.length // 더미 슬롯 수 = 현재 파티 인원

  // 프레임 연출 관련 상태값 함수
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame) 
  }, [])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <motion.img
        src={publicAsset(GAME_MATCHING_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: uiVisible ? 1 : 0 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <MatchingPopupPanel
        visible={uiVisible}
        slots={MATCHING_PARTY_SLOTS_DUMMY_10}
        onRoomCodeView={() => setRoomCodeOpen(true)} // 방코드 보기 모달 열기
      />

      <RoomCodeViewModal
        open={roomCodeOpen}
        onClose={() => setRoomCodeOpen(false)}
        roomCode={MATCHING_ROOM_CODE_DUMMY} // 미구현 (TODO: 서버 발급 방 코드)
      />

      <motion.div
        className={MATCHING_PARTY_HEADER_CLASS}
        initial={{ opacity: 0 }}
        animate={uiVisible ? { opacity: 1 } : { opacity: 0 }}
        transition={UI_REVEAL_TRANSITION}
        aria-label={`${MATCHING_POPUP_COPY.partyLabel} ${partyCount}명`}
      >
        <PublicAsset
          src={GAME_MATCHING_ASSETS.silhouetteNotReady}
          alt=""
          className={MATCHING_PARTY_ICON_CLASS}
        />
        <span className={MATCHING_PARTY_TEXT_CLASS}>
          {MATCHING_POPUP_COPY.partyLabel}{" "}
          <span className={MATCHING_PARTY_COUNT_CLASS}>{partyCount}</span>명
        </span>
      </motion.div>

      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <SoundControl />
      </div>

      <MotionBackButton
        ariaLabel="인게임 설정으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={() => navigate("/game-setup")}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      />
    </div>
  )
}
