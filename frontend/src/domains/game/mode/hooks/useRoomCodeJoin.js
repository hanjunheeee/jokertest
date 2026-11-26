// 방 코드 입장 요청·제한 시간·입장 실패 처리(알림 창 + 화면에 남길 까닭 글)
// useRoomInvitePage가 씀, 다른 Node 방이라는 거절이면 그 Node로 옮긴 뒤 같은 요청을 한 번만 다시 보냄
import { useCallback, useEffect, useRef, useState } from "react"
import { getSocket } from "@/shared/socket/socketClient.js"
import { NODE_MOVE_MESSAGES } from "@/shared/constants/connectionSocket.js"
import { joinByCode } from "../socket/rooms.js"
import { JOIN_FAILURE_MSGS, JOIN_TIMEOUT_MSG } from "../constants/roomJoinMessages.js"
import { retryOnceOnOwnerNode, useJoinTimer } from "./joinAttempt.js"

// Node 옮긴 뒤 같은 요청 다시 보내기(소켓 없으면 풀고 시간 초과 알림)·옮기기 실패 알림
function ownerNodeHandlers(sendJoin, clearJoin, notify) {
  return {
    resend: (attempt) => {
      const current = getSocket()
      if (current) sendJoin(current, attempt.payload)
      else { clearJoin(); notify(JOIN_TIMEOUT_MSG) }
    },
    fail: () => { clearJoin(); notify(NODE_MOVE_MESSAGES.ROOM_ON_OTHER_NODE) },
  }
}

// 제한 시간 지남: 아직 보내는 중이면 풀고 시간 초과 알림
function timeoutHandler(joiningRef, clearJoin, notify) {
  return () => {
    if (!joiningRef.current) return
    clearJoin()
    notify(JOIN_TIMEOUT_MSG)
  }
}

// 화면 살아 있음 표시, 떠날 때 제한 시간 타이머·연결 대기 전송 지우고 보내는 중 풂
function useMountedFlag(stopJoinTimer, stopPendingSend, joiningRef) {
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopPendingSend()
      stopJoinTimer()
      joiningRef.current = false
    }
  }, [stopJoinTimer, stopPendingSend, joiningRef])
  return mountedRef
}

// 방 코드 입장 상태·제한 시간·재시도 묶음
export function useRoomCodeJoin() {
  const [isJoining, setIsJoining] = useState(false)
  // 마지막 실패 까닭 글 (화면 안내 띠가 그림, 다시 누르면 지움)
  const [joinError, setJoinError] = useState(null)
  // 보내는 중 표시·제한 시간 타이머·미연결 대기 취소·화면 살아 있음
  const joiningRef = useRef(false)
  const cancelSendRef = useRef(null)
  const stopPendingSend = useCallback(() => {
    cancelSendRef.current?.()
    cancelSendRef.current = null
  }, [])
  const { stop: stopJoinTimer, start: startJoinTimer } = useJoinTimer()
  const mountedRef = useMountedFlag(stopJoinTimer, stopPendingSend, joiningRef)
  // 이번 입장 요청 { payload, moved } (Node 옮긴 뒤 다시 보낼 때 씀, 옮기기는 한 번만)
  const attemptRef = useRef(null)

  // 보내는 중 표시·미연결 대기·제한 시간 지움
  const clearJoin = useCallback(() => {
    joiningRef.current = false
    attemptRef.current = null
    stopPendingSend()
    stopJoinTimer()
    if (mountedRef.current) setIsJoining(false)
  }, [mountedRef, stopPendingSend, stopJoinTimer])

  // 실패 알림: 알림 창만 띄우면 닫은 뒤 까닭(탈주 대기 등)이 안 남고 화면 읽기가 못 읽어서 화면 글로도 남김
  const notify = useCallback((text) => {
    if (mountedRef.current) setJoinError(text)
    alert(text)
  }, [mountedRef])

  // 코드 입장 보내고 제한 시간 걸기 (미연결이면 connect 대기 손잡이를 잡아 두어 시간 초과 때 지움)
  const sendJoin = useCallback((socket, payload) => {
    stopPendingSend()
    cancelSendRef.current = joinByCode(socket, payload)
    startJoinTimer(timeoutHandler(joiningRef, clearJoin, notify))
  }, [clearJoin, startJoinTimer, stopPendingSend, notify])

  // 입장 실패: 내가 보낸 입장 중일 때만 알리고 다시 누를 수 있게 풂
  // 다른 Node 방이면 처음 한 번만 그 Node로 옮겨 같은 요청 다시 (옮기는 동안 제한 시간은 옮기기 쪽 10초)
  const failJoin = useCallback((answer) => {
    if (!joiningRef.current) return
    const moving = retryOnceOnOwnerNode(answer, attemptRef, {
      isAlive: () => mountedRef.current && joiningRef.current,
      ...ownerNodeHandlers(sendJoin, clearJoin, notify),
      stopTimer: () => { stopPendingSend(); stopJoinTimer() },
    })
    if (moving) return
    clearJoin()
    notify(JOIN_FAILURE_MSGS[answer.code] ?? NODE_MOVE_MESSAGES[answer.code] ?? answer.message ?? "방에 참여할 수 없습니다.")
  }, [mountedRef, clearJoin, sendJoin, stopPendingSend, stopJoinTimer, notify])

  // 코드 입장 시작: 보내는 중이면 안 보냄, 소켓 없으면 시간 초과 알림
  const startJoin = useCallback((payload) => {
    if (joiningRef.current) return
    const current = getSocket()
    if (!current) { notify(JOIN_TIMEOUT_MSG); return }
    joiningRef.current = true
    setIsJoining(true)
    setJoinError(null)
    attemptRef.current = { payload, moved: false }
    sendJoin(current, payload)
  }, [sendJoin, notify])
  const dismissJoinError = useCallback(() => setJoinError(null), [])
  return { isJoining, clearJoin, failJoin, startJoin, joinError, dismissJoinError }
}
