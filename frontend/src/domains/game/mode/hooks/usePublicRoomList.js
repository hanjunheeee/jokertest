// 공개 방 목록 상태·목록 묻기·갱신 방송 목록 반영
// usePublicRooms가 씀, 늦게 온 응답·다른 소켓 응답은 버림
import { useCallback, useRef, useState } from "react"
import { getSocket } from "@/shared/socket/socketClient.js"
import { askRooms } from "../socket/rooms.js"

// disposedRef: 화면 떠남 표시 (usePublicRooms가 들고 들어가기 쪽과 같이 봄)
export function usePublicRoomList(disposedRef) {
  const [rooms, setRooms] = useState([])
  // 목록 묻기 버전 (갱신 방송이 오면 올라가 묻던 응답을 버림)
  const fetchVerRef = useRef(0)

  // 목록 묻기: 늦게 온 응답·다른 소켓 응답은 버림 (갱신 방송이 오면 버전 올라감)
  const fetchRooms = useCallback(async () => {
    const socket = getSocket()
    if (!socket) return

    const ver = ++fetchVerRef.current
    const reqSocket = socket
    try {
      const response = await askRooms(socket)

      if (disposedRef.current || fetchVerRef.current !== ver) return
      if (reqSocket !== getSocket()) return
      if (response?.ok && Array.isArray(response.rooms)) setRooms(response.rooms)
    } catch {
      // 목록 묻기 실패·시간 초과는 무시함 (지금 목록을 그대로 둠)
    }
  }, [disposedRef])

  // 목록 갱신 방송: 받은 목록으로 바꾸고 묻던 응답은 버림 (버전 올림)
  const applyRoomList = useCallback((nextRooms) => {
    fetchVerRef.current += 1
    setRooms(nextRooms)
  }, [])

  return { rooms, fetchRooms, applyRoomList }
}
