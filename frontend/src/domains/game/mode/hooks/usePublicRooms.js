// 공개 방 목록 받기·갱신 반영, 공개 방 들어가기
// MultiplayEntryPage가 씀(모바일도 같음), 소켓이 바뀌면 새 소켓에 다시 붙고 목록을 새로 물음
// 다른 Node 방이라는 거절이면 그 Node로 옮긴 뒤 같은 방에 한 번만 다시 들어가기 (옮기는 동안도 들어가는 중)
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { PUBLIC_ROOM_JOIN_TIMEOUT_MS } from "@/domains/game/mode/constants/roomListSocket.js"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"
import { followRoomOwner } from "@/shared/socket/nodeMove.js"
import { NODE_MOVE_MESSAGES } from "@/shared/constants/connectionSocket.js"
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
  // 이번 들어가기 { roomId, moved } (Node 옮긴 뒤 다시 보낼 때 씀, 옮기기는 한 번만)
  const attemptRef = useRef(null)

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
  }, [stopJoinTimer])

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
  }, [clearJoin, sendJoin, stopJoinTimer])

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
    // 내가 안 보낸 입장(판 끝난 뒤 서버가 넣어 준 파티 방 등)도 서버에선 이미 그 방 사람이라 따라감
    const handleJoined = (room) => {
      if (!isCurrent()) return
      clearJoin()
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(room)
      navigate("/game-matching")
    }
    // 입장 실패: 다시 누를 수 있게 풀고 알림 (내가 보낸 입장 중일 때만, FE-032)
    const handleJoinFailed = (answer = {}) => {
      if (!isCurrent()) return
      if (!joiningRef.current) return
      if (retryOnOwnerNode(answer)) return
      clearJoin()
      alert(answer.message ?? NODE_MOVE_MESSAGES[answer.code] ?? "공개 방에 참여할 수 없습니다.")
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
    // 목록 묻기는 응답이 온 뒤에만 상태를 바꿔 그리는 중 연쇄 갱신이 없음
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRooms()

    // 떠날 때 옛 핸들러 막고 뗌, 들어가는 중 표시 지움
    return () => {
      owned = false
      off()
      clearJoin()
    }
  }, [socket, fetchRooms, navigate, clearJoin, retryOnOwnerNode])

  // 공개 방 들어가기: 응답 방송이 안 오면 제한 시간 뒤 다시 누를 수 있게 풂
  const joinPublicRoom = useCallback((roomId) => {
    // 이미 들어가는 중이거나 소켓 없으면 안 보냄
    if (joiningRef.current) return

    const socket = getSocket()
    if (!socket) return

    joiningRef.current = true
    setIsJoining(true)
    attemptRef.current = { roomId, moved: false }
    sendJoin(socket, roomId)
  }, [sendJoin])

  return { rooms, refreshRooms: fetchRooms, joinPublicRoom, isJoining }
}
