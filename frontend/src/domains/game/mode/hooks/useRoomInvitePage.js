import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"

/**
 * room_join_failed의 code별 안내 문구입니다. 서버가 내려주는 message를 그대로 띄우지 않고
 * code로 분기하는 이유는, 문구는 언제든 다듬을 수 있어 화면이 의존할 계약이 못 되기
 * 때문입니다(코드 목록의 원본은 backend/socket/roomJoinErrors.js).
 * 여기 없는 code는 서버 message로, 그것도 없으면 기본 문구로 폴백합니다.
 */
const ROOM_JOIN_FAILURE_MESSAGES = {
  ROOM_CODE_MISMATCH: "입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.",
  ROOM_NOT_FOUND: "방을 찾을 수 없습니다. 이미 사라진 방일 수 있어요.",
  ROOM_ALREADY_STARTED: "이미 게임이 시작된 방이라 입장할 수 없습니다.",
  ROOM_FULL: "방 정원이 가득 찼습니다.",
  CODE_REQUIRED: "입장 코드를 입력해주세요.",
}

/** 방코드 입력 페이지의 애니메이션 상태와 방 참여 소켓 이벤트를 관리합니다. */
export function useRoomInvitePage() {
  const navigate = useNavigate()

  // 프레임과 버튼 등장 애니메이션을 시작할지 표시합니다.
  const [uiVisible, setUiVisible] = useState(false)

  // 사용자가 입력한 6자리 방코드입니다.
  const [roomCode, setRoomCode] = useState("")

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const handleRoomJoined = (payload) => {
      // matching store를 설정하기 전에 인게임 store의 이전 gameId를 먼저 무효화한다
      // (useGameSetupPage.js의 enterRoom과 동일한 이유).
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      navigate("/game-matching")
    }

    // payload 자체가 없는 경우에도 구조분해 예외 없이 기본 문구를 띄운다.
    const handleRoomJoinFailed = ({ code, message } = {}) => {
      alert(ROOM_JOIN_FAILURE_MESSAGES[code] ?? message ?? "방에 참여할 수 없습니다.")
    }

    socket.on("room_joined", handleRoomJoined)
    socket.on("room_join_failed", handleRoomJoinFailed)

    return () => {
      socket.off("room_joined", handleRoomJoined)
      socket.off("room_join_failed", handleRoomJoinFailed)
    }
  }, [navigate])

  const joinRoom = () => {
    if (roomCode.length < 6) return
    getSocket()?.emit("join_room_by_code", { roomCode })
  }

  const goBackToModeSelect = () => {
    navigate("/gameMode")
  }

  return {
    uiVisible,
    roomCode,
    setRoomCode,
    joinRoom,
    goBackToModeSelect,
  }
}
