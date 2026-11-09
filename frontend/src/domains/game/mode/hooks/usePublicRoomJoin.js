// 공개 방 들어가기 요청·제한 시간·입장 실패 처리
// usePublicRooms가 씀, 다른 Node 방이라는 거절이면 그 Node로 옮긴 뒤 같은 방에 한 번만 다시 들어가기
import { useCallback, useRef, useState } from "react"
import { PUBLIC_ROOM_JOIN_TIMEOUT_MS } from "@/domains/game/mode/constants/roomListSocket.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { followRoomOwner } from "@/shared/socket/nodeMove.js"
import { NODE_MOVE_MESSAGES } from "@/shared/constants/connectionSocket.js"
import { joinPublic } from "../socket/rooms.js"

// disposedRef: 화면 떠남 표시 (떠난 뒤엔 상태 안 바꿈)
export function usePublicRoomJoin(disposedRef) {
  const [isJoining, setIsJoining] = useState(false)
  // 들어가는 중 표시·제한 시간 타이머
  const joiningRef = useRef(false)
  const joinTimerRef = useRef(null)
  // 이번 들어가기 { roomId, moved } (Node 옮긴 뒤 다시 보낼 때 씀, 옮기기는 한 번만)
  const attemptRef = useRef(null)

  // 제한 시간 타이머만 지움
  const stopJoinTimer = useCallback(() => {
    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current)
      joinTimerRef.current = null
    }
  }, [])

  // 들어가는 중 표시·제한 시간 지움
  const clearJoin = useCallback(() => {
    joiningRef.current = false
    attemptRef.current = null
    stopJoinTimer()
    if (!disposedRef.current) setIsJoining(false)
  }, [disposedRef, stopJoinTimer])

  // 공개 방 들어가기 보내고 제한 시간 걸기 (처음·Node 옮긴 뒤 다시 보내기 같이 씀)
  const sendJoin = useCallback((socket, roomId) => {
    joinPublic(socket, roomId)
    stopJoinTimer()
    joinTimerRef.current = window.setTimeout(() => {
      joinTimerRef.current = null
      clearJoin()
    }, PUBLIC_ROOM_JOIN_TIMEOUT_MS)
  }, [clearJoin, stopJoinTimer])

  // 다른 Node 방이라는 거절이면 처음 한 번만 그 Node로 옮겨 다시 보냄, 옮기기 시작했으면 true
  const retryOnOwnerNode = useCallback((answer) => {
    const attempt = attemptRef.current
    if (!attempt || attempt.moved) return false
    const moving = followRoomOwner(answer, {
      isCurrent: () => !disposedRef.current && joiningRef.current && attemptRef.current === attempt,
      resend: () => {
        const current = getSocket()
        if (current) sendJoin(current, attempt.roomId)
        else clearJoin()
      },
      fail: () => {
        clearJoin()
        alert(NODE_MOVE_MESSAGES.ROOM_ON_OTHER_NODE)
      },
    })
    if (!moving) return false
    attempt.moved = true
    stopJoinTimer()
    return true
  }, [disposedRef, clearJoin, sendJoin, stopJoinTimer])

  // 입장 실패: 다시 누를 수 있게 풀고 알림 (내가 보낸 입장 중일 때만, FE-032)
  const failJoin = useCallback((answer) => {
    if (!joiningRef.current) return
    if (retryOnOwnerNode(answer)) return
    clearJoin()
    alert(answer.message ?? NODE_MOVE_MESSAGES[answer.code] ?? "공개 방에 참여할 수 없습니다.")
  }, [clearJoin, retryOnOwnerNode])

  // 공개 방 들어가기: 이미 들어가는 중이거나 소켓 없으면 안 보냄, 응답 방송이 안 오면 제한 시간 뒤 풂
  const joinPublicRoom = useCallback((roomId) => {
    if (joiningRef.current) return
    const socket = getSocket()
    if (!socket) return
    joiningRef.current = true
    setIsJoining(true)
    attemptRef.current = { roomId, moved: false }
    sendJoin(socket, roomId)
  }, [sendJoin])

  return { isJoining, clearJoin, failJoin, joinPublicRoom }
}
