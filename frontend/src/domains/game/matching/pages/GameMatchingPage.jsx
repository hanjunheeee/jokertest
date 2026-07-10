/**
 * 멀티플레이 매칭 대기 화면.
 *
 * matchingStore에 방 데이터가 있으면 실제 플레이어·방 코드를 표시합니다.
 * 없으면 prototype 더미로 폴백 (게임 만들기 흐름 호환).
 *
 * - 방장: 게임시작·방 삭제 가능
 * - 비방장: 방 나가기
 */
import { motion } from "framer-motion"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import MatchingPopupPanel from "../components/MatchingPopupPanel.jsx"
import RoomCodeViewModal from "../components/RoomCodeViewModal.jsx"
import MatchingPartyHeader from "../components/MatchingPartyHeader.jsx"
import {
  GAME_MATCHING_ASSETS,
  MATCHING_PARTY_SLOTS_DUMMY_10,
  MATCHING_ROOM_CODE_DUMMY,
} from "../constants/gameMatchingAssets.js"
import MotionBackButton from "@/shared/ui/MotionBackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { BG_FADE_TRANSITION, UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { useMatchingStore } from "../store/matchingStore"
import { useMatchingRoom } from "../hooks/useMatchingRoom"
import { getSocket } from "@/shared/socket/socketClient"
import { useAuthStore } from "@/domains/auth/store/authStore"

export default function GameMatchingPage() {
  const navigate = useNavigate()
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅입니다.
  // 값을 바꾸는 함수를 호출해야 React가 이 컴포넌트를 다시 렌더링합니다.
  // uiVisible: 입장 연출(페이드인)이 끝나 UI가 보여야 하는지 여부
  const [uiVisible, setUiVisible]   = useState(false)
  // roomCodeOpen: "방코드 보기" 모달(RoomCodeViewModal)이 열려 있는지 여부
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)

  // matchingStore 전체를 구독(selector 없이 호출)해 방 관련 state를 꺼내 씀
  const { isInRoom, players, roomCode, hostUuid, clearRoom } = useMatchingStore()
  // authStore에서 로그인한 내 uuid만 골라서 구독 (selector 패턴)
  const myUuid = useAuthStore((s) => s.user?.uuid)
  // 방에 입장한 상태이고, 내 uuid가 방장 uuid와 같으면 방장으로 간주
  const isHost = isInRoom && myUuid === hostUuid

  // useCallback(함수, deps)는 deps가 바뀌지 않는 한 매 렌더링마다 함수를 새로
  // 만들지 않고 이전 함수를 그대로 재사용하게 해주는 훅입니다. 아래 함수들은
  // useMatchingRoom에 넘겨져 useEffect의 deps로도 쓰이므로, 매번 새 함수가
  // 만들어지면 그 useEffect가 불필요하게 재실행됩니다. navigate는 참조가
  // 바뀌지 않는 안정적인 함수라 deps에 넣어도 실질적인 재생성은 거의 없습니다.
  // 게임 시작 시 서버 GameState를 받은 뒤 인게임 화면으로 이동
  const handleRoomDeleted = useCallback(() => navigate('/multiplay'), [navigate])
  const handleGameStarted = useCallback(() => navigate('/ingame'),    [navigate])

  // custom hook 호출 — 방 내 소켓 이벤트 구독은 훅 내부에서 처리되고,
  // 방장 액션 함수(deleteRoom, startGame)만 돌려받아 버튼에 연결
  const { deleteRoom, startGame } = useMatchingRoom({
    onRoomDeleted: handleRoomDeleted,
    onGameStarted: handleGameStarted,
  })

  // 마운트 시 한 번만 실행되는 useEffect (deps가 빈 배열 []).
  // 다음 프레임에서 uiVisible 전환 — 마운트 직후 즉시 전환 시 transition이 무시됨
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    // cleanup: 컴포넌트가 사라지기 전에 예약된 애니메이션 프레임 요청을 취소
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleBack = () => {
    getSocket()?.emit('leave_room')
    clearRoom()
    navigate('/multiplay')
  }

  // store에 방 데이터가 없으면 prototype 더미 표시 (게임 만들기 흐름)
  const slots      = isInRoom ? players.map((p) => ({ id: p.uuid, ready: true })) : MATCHING_PARTY_SLOTS_DUMMY_10
  const code       = isInRoom ? roomCode : MATCHING_ROOM_CODE_DUMMY
  const partyCount = slots.length

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
        slots={slots}
        onRoomCodeView={() => setRoomCodeOpen(true)}
        isHost={isHost}
        onStartGame={startGame}
        onDeleteRoom={deleteRoom}
        onLeaveRoom={handleBack}
      />

      <RoomCodeViewModal
        open={roomCodeOpen}
        onClose={() => setRoomCodeOpen(false)}
        roomCode={code}
      />

      <MatchingPartyHeader
        visible={uiVisible}
        partyCount={partyCount}
        transition={UI_REVEAL_TRANSITION}
      />

      <div className="absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <SoundControl />
      </div>

      <MotionBackButton
        ariaLabel="멀티플레이 선택으로 돌아가기"
        initial={{ opacity: 0, y: 8 }}
        animate={uiVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={UI_REVEAL_TRANSITION}
        onClick={handleBack}
        className={`${BACK_BUTTON_PAGE_POSITION_CLASS} z-30`}
        style={{ pointerEvents: uiVisible ? "auto" : "none" }}
      />
    </div>
  )
}
