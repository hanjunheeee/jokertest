import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
  PUBLIC_ROOM_JOIN_TIMEOUT_MS,
  PUBLIC_ROOM_LIST_TIMEOUT_MS,
  ROOM_LIST_SOCKET_EVENTS,
} from "@/domains/game/mode/constants/roomListSocket.js"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"

export function usePublicRooms() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [isJoining, setIsJoining] = useState(false)

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  const disposedRef = useRef(false)
  const fetchVersionRef = useRef(0)
  const isJoiningRef = useRef(false)
  const joinTimeoutRef = useRef(null)

  const fetchRooms = useCallback(async () => {
    const socket = getSocket()
    if (!socket) return

    const requestVersion = ++fetchVersionRef.current
    const requestSocket = socket
    try {
      const response = await socket
        .timeout(PUBLIC_ROOM_LIST_TIMEOUT_MS)
        .emitWithAck(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS, {})

      if (disposedRef.current || fetchVersionRef.current !== requestVersion) return
      if (requestSocket !== getSocket()) return
      if (response?.ok && Array.isArray(response.rooms)) setRooms(response.rooms)
    } catch {
    }
  }, [])

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
    return () => { disposedRef.current = true }
  }, [])

  useEffect(() => {
    if (!socket) return undefined

    const attachedSocket = socket
    let owned = true
    const isCurrentSource = () => owned && attachedSocket === getSocket()

    const handleRoomsUpdated = ({ rooms: nextRooms } = {}) => {
      if (!Array.isArray(nextRooms)) return
      if (!isCurrentSource()) return
      fetchVersionRef.current += 1
      setRooms(nextRooms)
    }
    const handleRoomJoined = (room) => {
      if (!isCurrentSource()) return
      clearJoinState()
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(room)
      navigate("/game-matching")
    }
    const handleRoomJoinFailed = ({ message } = {}) => {
      if (!isCurrentSource()) return
      clearJoinState()
      alert(message ?? "공개 방에 참여할 수 없습니다.")
    }
    const handleConnect = () => {
      if (!isCurrentSource()) return
      fetchRooms()
    }

    attachedSocket.on(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, handleRoomsUpdated)
    attachedSocket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, handleRoomJoined)
    attachedSocket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, handleRoomJoinFailed)
    attachedSocket.on("connect", handleConnect)
    fetchRooms()

    return () => {
      owned = false
      attachedSocket.off(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, handleRoomsUpdated)
      attachedSocket.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, handleRoomJoined)
      attachedSocket.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, handleRoomJoinFailed)
      attachedSocket.off("connect", handleConnect)
      clearJoinState()
    }
  }, [socket, fetchRooms, navigate, clearJoinState])

  const joinPublicRoom = useCallback((roomId) => {
    if (isJoiningRef.current) return

    const socket = getSocket()
    if (!socket) return

    isJoiningRef.current = true
    setIsJoining(true)
    socket.emit(ROOM_LIST_SOCKET_EVENTS.JOIN_PUBLIC_ROOM, { roomId })

    joinTimeoutRef.current = window.setTimeout(() => {
      joinTimeoutRef.current = null
      clearJoinState()
    }, PUBLIC_ROOM_JOIN_TIMEOUT_MS)
  }, [clearJoinState])

  return { rooms, refreshRooms: fetchRooms, joinPublicRoom, isJoining }
}
