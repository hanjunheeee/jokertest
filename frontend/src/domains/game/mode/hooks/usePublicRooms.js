// 공개 방 목록 받기·갱신 반영, 공개 방 들어가기
// MultiplayEntryPage가 씀, 소켓이 바뀌면 새 소켓에 다시 붙고 목록을 새로 물음
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { PUBLIC_ROOM_JOIN_TIMEOUT_MS } from "@/domains/game/mode/constants/roomListSocket.js"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"
import { askRooms, joinPublic, onRoomList } from "../socket/rooms.js"

// 공개 방 목록·들어가기 상태
export function usePublicRooms() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [isJoining, setIsJoining] = useState(false)

  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 화면 떠남 표시·목록 묻기 버전·들어가는 중 표시·제한 시간 타이머
  const disposedRef = useRef(false)
  const fetchVerRef = useRef(0)
  const joiningRef = useRef(false)
  const joinTimerRef = useRef(null)

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
  }, [])

  // 들어가는 중 표시·제한 시간 지움
  const clearJoin = useCallback(() => {
    joiningRef.current = false
    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current)
      joinTimerRef.current = null
    }
    if (!disposedRef.current) setIsJoining(false)
  }, [])

  // 화면 살아 있는지 표시
  useEffect(() => {
    disposedRef.current = false
    return () => { disposedRef.current = true }
  }, [])

  // 소켓 붙이기: 목록 갱신·입장 결과·다시 연결 받고 목록 새로 물음
  useEffect(() => {
    if (!socket) return undefined

    // 붙인 소켓이 지금 소켓일 때만 반영
    const attachedSocket = socket
    let owned = true
    const isCurrent = () => owned && attachedSocket === getSocket()

    // 목록 갱신 방송: 받은 목록으로 바꾸고 묻던 응답은 버림 (버전 올림)
    const handleUpdated = ({ rooms: nextRooms } = {}) => {
      if (!Array.isArray(nextRooms)) return
      if (!isCurrent()) return
      fetchVerRef.current += 1
      setRooms(nextRooms)
    }
    // 입장 성공: 끝난 판 지우고 방 넣고 대기방으로
    const handleJoined = (room) => {
      if (!isCurrent()) return
      clearJoin()
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(room)
      navigate("/game-matching")
    }
    // 입장 실패: 다시 누를 수 있게 풀고 알림
    const handleJoinFailed = ({ message } = {}) => {
      if (!isCurrent()) return
      clearJoin()
      alert(message ?? "공개 방에 참여할 수 없습니다.")
    }
    // 다시 연결되면 목록 새로 물음
    const handleConnect = () => {
      if (!isCurrent()) return
      fetchRooms()
    }

    const off = onRoomList(attachedSocket, {
      updated: handleUpdated,
      joined: handleJoined,
      joinFailed: handleJoinFailed,
      connect: handleConnect,
    })
    fetchRooms()

    // 떠날 때 옛 핸들러 막고 뗌, 들어가는 중 표시 지움
    return () => {
      owned = false
      off()
      clearJoin()
    }
  }, [socket, fetchRooms, navigate, clearJoin])

  // 공개 방 들어가기: 응답 방송이 안 오면 제한 시간 뒤 다시 누를 수 있게 풂
  const joinPublicRoom = useCallback((roomId) => {
    // 이미 들어가는 중이거나 소켓 없으면 안 보냄
    if (joiningRef.current) return

    const socket = getSocket()
    if (!socket) return

    joiningRef.current = true
    setIsJoining(true)
    joinPublic(socket, roomId)

    joinTimerRef.current = window.setTimeout(() => {
      joinTimerRef.current = null
      clearJoin()
    }, PUBLIC_ROOM_JOIN_TIMEOUT_MS)
  }, [clearJoin])

  return { rooms, refreshRooms: fetchRooms, joinPublicRoom, isJoining }
}
