// 방 들어가기 제한 시간 타이머 + 다른 Node 방이면 한 번만 옮겨 다시 보내기
// usePublicRoomJoin·useRoomCodeJoin이 같이 씀
import { useCallback, useRef } from "react"
import { followRoomOwner } from "@/shared/socket/nodeMove.js"
import { PUBLIC_ROOM_JOIN_TIMEOUT_MS } from "../constants/roomListSocket.js"

// 제한 시간 타이머 하나: stop은 지우기만, start는 옛 것 지우고 새로 걸기
export function useJoinTimer() {
  const timerRef = useRef(null)

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback((onTimeout) => {
    stop()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      onTimeout()
    }, PUBLIC_ROOM_JOIN_TIMEOUT_MS)
  }, [stop])

  return { stop, start }
}

// 다른 Node 방이라는 거절이면 처음 한 번만 그 Node로 옮겨 다시 보냄, 옮기기 시작했으면 true
// attemptRef.current: 이번 들어가기 { …, moved }, isAlive: 화면 살아 있고 들어가는 중인지
export function retryOnceOnOwnerNode(answer, attemptRef, { isAlive, resend, fail, stopTimer }) {
  const attempt = attemptRef.current
  if (!attempt || attempt.moved) return false
  const moving = followRoomOwner(answer, {
    isCurrent: () => isAlive() && attemptRef.current === attempt,
    resend: () => resend(attempt),
    fail,
  })
  if (!moving) return false
  attempt.moved = true
  stopTimer()
  return true
}
