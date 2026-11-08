// 방 코드로 들어가기 화면: 코드 입력 상태·입장 요청·입장 결과 처리
// RoomInvitePage가 씀(모바일도 같음), 소켓이 바뀌면 새 소켓에 다시 붙음
// 보내는 중엔 다시 안 보내고, 결과 방송이 안 오면 제한 시간 뒤 다시 누를 수 있게 풂
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"
import { joinByCode, onJoinResult } from "../socket/rooms.js"
import { JOIN_FAILURE_MSGS, JOIN_TIMEOUT_MSG } from "../constants/roomJoinMessages.js"
import { PUBLIC_ROOM_JOIN_TIMEOUT_MS } from "../constants/roomListSocket.js"

export function useRoomInvitePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedRoomId = typeof location.state?.roomId === "string" ? location.state.roomId : null

  const [uiVisible, setUiVisible] = useState(false)
  const [roomCode, setRoomCode] = useState("")
  const [isJoining, setIsJoining] = useState(false)

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 보내는 중 표시·제한 시간 타이머·화면 살아 있음
  const joiningRef = useRef(false)
  const joinTimerRef = useRef(null)
  const mountedRef = useRef(true)

  // 화면 살아 있음 표시, 떠날 때 제한 시간 타이머 지움
  useEffect(() => {
    mountedRef.current = true
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => {
      mountedRef.current = false
      cancelAnimationFrame(frame)
      if (joinTimerRef.current !== null) window.clearTimeout(joinTimerRef.current)
      joinTimerRef.current = null
      joiningRef.current = false
    }
  }, [])

  // 보내는 중 표시·제한 시간 지움
  const clearJoin = useCallback(() => {
    joiningRef.current = false
    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current)
      joinTimerRef.current = null
    }
    if (mountedRef.current) setIsJoining(false)
  }, [])

  useEffect(() => {
    if (!socket) return undefined
    const attachedSocket = socket
    let owned = true
    const isCurrent = () => owned && attachedSocket === getSocket()

    // 입장 성공: 끝난 판 지우고 방 넣고 대기방으로
    const handleRoomJoined = (payload) => {
      if (!isCurrent()) return
      clearJoin()
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      navigate("/game-matching")
    }

    // 입장 실패: 내가 보낸 입장 중일 때만 알리고 다시 누를 수 있게 풂
    const handleRoomJoinFailed = ({ code, message } = {}) => {
      if (!isCurrent() || !joiningRef.current) return
      clearJoin()
      alert(JOIN_FAILURE_MSGS[code] ?? message ?? "방에 참여할 수 없습니다.")
    }

    const off = onJoinResult(attachedSocket, { joined: handleRoomJoined, failed: handleRoomJoinFailed })
    // 소켓이 바뀌면 옛 소켓 결과는 안 받음 (보내는 중 표시는 제한 시간이 풂)
    return () => {
      owned = false
      off()
    }
  }, [socket, navigate, clearJoin])

  // 여섯 자리가 다 찼을 때만 보냄, 목록에서 고른 방이면 방 id도 실음
  const joinRoom = () => {
    if (roomCode.length < 6) return
    if (joiningRef.current) return
    const current = getSocket()
    if (!current) {
      alert(JOIN_TIMEOUT_MSG)
      return
    }
    joiningRef.current = true
    setIsJoining(true)
    joinByCode(current, {
      roomCode,
      ...(selectedRoomId ? { roomId: selectedRoomId } : {}),
    })
    joinTimerRef.current = window.setTimeout(() => {
      joinTimerRef.current = null
      if (!joiningRef.current) return
      clearJoin()
      alert(JOIN_TIMEOUT_MSG)
    }, PUBLIC_ROOM_JOIN_TIMEOUT_MS)
  }

  const goBackToModeSelect = () => {
    navigate("/gameMode")
  }

  return {
    uiVisible,
    roomCode,
    setRoomCode,
    joinRoom,
    isJoining,
    goBackToModeSelect,
  }
}
