// 방 코드로 들어가기 화면: 코드 입력 상태·입장 결과 처리
// RoomInvitePage가 씀(모바일도 같음), 소켓이 바뀌면 새 소켓에 다시 붙음
// 입장 요청·제한 시간·Node 옮겨 다시 보내기는 useRoomCodeJoin
import { useEffect, useState, useSyncExternalStore } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"
import { onJoinResult } from "../socket/rooms.js"
import { useRoomCodeJoin } from "./useRoomCodeJoin.js"

export function useRoomInvitePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedRoomId = typeof location.state?.roomId === "string" ? location.state.roomId : null

  const [uiVisible, setUiVisible] = useState(false)
  const [roomCode, setRoomCode] = useState("")

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const { isJoining, clearJoin, failJoin, startJoin } = useRoomCodeJoin()

  // 다음 그리기 때 화면 보이기
  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
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

    // 입장 실패: 붙인 소켓 결과만 봄
    const handleRoomJoinFailed = (answer = {}) => {
      if (!isCurrent()) return
      failJoin(answer)
    }

    const off = onJoinResult(attachedSocket, { joined: handleRoomJoined, failed: handleRoomJoinFailed })
    // 소켓이 바뀌면 옛 소켓 결과는 안 받음 (보내는 중 표시는 제한 시간이 풂)
    return () => {
      owned = false
      off()
    }
  }, [socket, navigate, clearJoin, failJoin])

  // 여섯 자리가 다 찼을 때만 보냄, 목록에서 고른 방이면 방 id도 실음
  const joinRoom = () => {
    if (roomCode.length < 6) return
    const payload = {
      roomCode,
      ...(selectedRoomId ? { roomId: selectedRoomId } : {}),
    }
    startJoin(payload)
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
