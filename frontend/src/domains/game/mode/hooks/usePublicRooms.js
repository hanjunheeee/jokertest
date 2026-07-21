import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import {
  PUBLIC_ROOM_JOIN_TIMEOUT_MS,
  PUBLIC_ROOM_LIST_TIMEOUT_MS,
  ROOM_LIST_SOCKET_EVENTS,
} from "@/domains/game/mode/constants/roomListSocket.js"
import { getSocket } from "@/shared/socket/socketClient.js"

/** 공개 Room 목록 조회·실시간 갱신·선택 입장을 관리합니다. */
export function usePublicRooms() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [isJoining, setIsJoining] = useState(false)

  // 컴포넌트가 이미 사라진 뒤 도착한 ack로 상태를 갱신하지 않기 위한 가드입니다.
  const disposedRef = useRef(false)
  // fetchRooms를 여러 번 호출했을 때(재연결 시마다 등), 늦게 도착한 옛 요청의 ack가
  // 나중에 온 실시간 방송(public_rooms_updated)이나 더 최근 요청의 결과를 덮어쓰지
  // 않도록 요청마다 버전을 매겨 마지막 요청의 응답만 반영합니다.
  const fetchVersionRef = useRef(0)
  const isJoiningRef = useRef(false)
  const joinTimeoutRef = useRef(null)

  const fetchRooms = useCallback(async () => {
    const socket = getSocket()
    if (!socket) return

    const requestVersion = ++fetchVersionRef.current
    try {
      const response = await socket
        .timeout(PUBLIC_ROOM_LIST_TIMEOUT_MS)
        .emitWithAck(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS, {})

      // 언마운트됐거나, 그 사이 더 최근 조회가 시작됐다면 이 응답은 버립니다.
      if (disposedRef.current || fetchVersionRef.current !== requestVersion) return
      if (response?.ok && Array.isArray(response.rooms)) setRooms(response.rooms)
    } catch {
      // 다음 서버 갱신 이벤트에서 다시 동기화될 수 있으므로 기존 목록을 유지합니다.
    }
  }, [])

  // isJoining 해제를 한 곳에 모아둡니다 — 성공/실패/timeout/unmount 어느 경로로 끝나든
  // 이 함수를 거치게 해서 해제를 빠뜨리는 경로가 생기지 않게 합니다.
  const clearJoinState = useCallback(() => {
    isJoiningRef.current = false
    if (joinTimeoutRef.current !== null) {
      window.clearTimeout(joinTimeoutRef.current)
      joinTimeoutRef.current = null
    }
    if (!disposedRef.current) setIsJoining(false)
  }, [])

  useEffect(() => {
    disposedRef.current = false
    let retryTimer = null
    let attachedSocket = null

    const handleRoomsUpdated = ({ rooms: nextRooms } = {}) => {
      if (Array.isArray(nextRooms)) setRooms(nextRooms)
    }
    const handleRoomJoined = (room) => {
      clearJoinState()
      useMatchingStore.getState().setRoom(room)
      navigate("/game-matching")
    }
    const handleRoomJoinFailed = ({ message } = {}) => {
      clearJoinState()
      alert(message ?? "공개 방에 참여할 수 없습니다.")
    }
    // Socket.IO는 재연결에 성공해도 'connect'를 다시 발생시킵니다. 끊겨 있던 동안
    // 놓친 변경분을 따라잡기 위해 재연결 시점에 목록을 다시 조회합니다.
    const handleConnect = () => {
      fetchRooms()
    }

    const attachSocket = () => {
      if (disposedRef.current) return

      const socket = getSocket()
      if (!socket) {
        retryTimer = window.setTimeout(attachSocket, 100)
        return
      }

      attachedSocket = socket
      socket.on(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, handleRoomsUpdated)
      socket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, handleRoomJoined)
      socket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, handleRoomJoinFailed)
      socket.on("connect", handleConnect)
      fetchRooms()
    }

    attachSocket()

    return () => {
      disposedRef.current = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      attachedSocket?.off(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, handleRoomsUpdated)
      attachedSocket?.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, handleRoomJoined)
      attachedSocket?.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, handleRoomJoinFailed)
      attachedSocket?.off("connect", handleConnect)
      if (joinTimeoutRef.current !== null) window.clearTimeout(joinTimeoutRef.current)
    }
  }, [fetchRooms, navigate, clearJoinState])

  const joinPublicRoom = useCallback((roomId) => {
    // 서버의 pendingRoomTransitions와 별개로 존재하는 프런트 UX 보호 장치입니다. 서버가
    // 최종 검증을 다시 하므로, 여기서는 응답 오기 전 연타로 생기는 불필요한 요청만 줄입니다.
    if (isJoiningRef.current) return

    const socket = getSocket()
    if (!socket) return

    isJoiningRef.current = true
    setIsJoining(true)
    socket.emit(ROOM_LIST_SOCKET_EVENTS.JOIN_PUBLIC_ROOM, { roomId })

    // room_joined/room_join_failed 응답이 유실될 가능성에 대비한 최후 안전장치입니다.
    joinTimeoutRef.current = window.setTimeout(() => {
      joinTimeoutRef.current = null
      clearJoinState()
    }, PUBLIC_ROOM_JOIN_TIMEOUT_MS)
  }, [clearJoinState])

  return { rooms, refreshRooms: fetchRooms, joinPublicRoom, isJoining }
}
