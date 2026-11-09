// 방 코드 입장 요청·제한 시간·입장 실패 처리
// useRoomInvitePage가 씀, 다른 Node 방이라는 거절이면 그 Node로 옮긴 뒤 같은 요청을 한 번만 다시 보냄
import { useCallback, useEffect, useRef, useState } from "react"
import { getSocket } from "@/shared/socket/socketClient.js"
import { followRoomOwner } from "@/shared/socket/nodeMove.js"
import { NODE_MOVE_MESSAGES } from "@/shared/constants/connectionSocket.js"
import { joinByCode } from "../socket/rooms.js"
import { JOIN_FAILURE_MSGS, JOIN_TIMEOUT_MSG } from "../constants/roomJoinMessages.js"
import { PUBLIC_ROOM_JOIN_TIMEOUT_MS } from "../constants/roomListSocket.js"

export function useRoomCodeJoin() {
  const [isJoining, setIsJoining] = useState(false)
  // 보내는 중 표시·제한 시간 타이머·화면 살아 있음
  const joiningRef = useRef(false)
  const joinTimerRef = useRef(null)
  const mountedRef = useRef(true)
  // 이번 입장 요청 { payload, moved } (Node 옮긴 뒤 다시 보낼 때 씀, 옮기기는 한 번만)
  const attemptRef = useRef(null)

  // 제한 시간 타이머만 지움
  const stopJoinTimer = useCallback(() => {
    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current)
      joinTimerRef.current = null
    }
  }, [])

  // 화면 살아 있음 표시, 떠날 때 제한 시간 타이머 지움
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopJoinTimer()
      joiningRef.current = false
    }
  }, [stopJoinTimer])

  // 보내는 중 표시·제한 시간 지움
  const clearJoin = useCallback(() => {
    joiningRef.current = false
    attemptRef.current = null
    stopJoinTimer()
    if (mountedRef.current) setIsJoining(false)
  }, [stopJoinTimer])

  // 코드 입장 보내고 제한 시간 걸기 (처음·Node 옮긴 뒤 다시 보내기 같이 씀)
  const sendJoin = useCallback((socket, payload) => {
    joinByCode(socket, payload)
    stopJoinTimer()
    joinTimerRef.current = window.setTimeout(() => {
      joinTimerRef.current = null
      if (!joiningRef.current) return
      clearJoin()
      alert(JOIN_TIMEOUT_MSG)
    }, PUBLIC_ROOM_JOIN_TIMEOUT_MS)
  }, [clearJoin, stopJoinTimer])

  // 입장 실패: 내가 보낸 입장 중일 때만 알리고 다시 누를 수 있게 풂
  // 다른 Node 방이면 처음 한 번만 그 Node로 옮겨 같은 요청 다시 (옮기는 동안 제한 시간은 옮기기 쪽 10초)
  const failJoin = useCallback((answer) => {
    if (!joiningRef.current) return
    const attempt = attemptRef.current
    if (attempt && !attempt.moved) {
      const moving = followRoomOwner(answer, {
        isCurrent: () => mountedRef.current && joiningRef.current && attemptRef.current === attempt,
        resend: () => {
          const current = getSocket()
          if (current) sendJoin(current, attempt.payload)
          else { clearJoin(); alert(JOIN_TIMEOUT_MSG) }
        },
        fail: () => { clearJoin(); alert(NODE_MOVE_MESSAGES.ROOM_ON_OTHER_NODE) },
      })
      if (moving) { attempt.moved = true; stopJoinTimer(); return }
    }
    clearJoin()
    alert(JOIN_FAILURE_MSGS[answer.code] ?? NODE_MOVE_MESSAGES[answer.code] ?? answer.message ?? "방에 참여할 수 없습니다.")
  }, [clearJoin, sendJoin, stopJoinTimer])

  // 코드 입장 시작: 보내는 중이면 안 보냄, 소켓 없으면 시간 초과 알림
  const startJoin = useCallback((payload) => {
    if (joiningRef.current) return
    const current = getSocket()
    if (!current) { alert(JOIN_TIMEOUT_MSG); return }
    joiningRef.current = true
    setIsJoining(true)
    attemptRef.current = { payload, moved: false }
    sendJoin(current, payload)
  }, [sendJoin])
  return { isJoining, clearJoin, failJoin, startJoin }
}
