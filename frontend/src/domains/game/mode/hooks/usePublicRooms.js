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

/** 공개 Room 목록 조회·실시간 갱신·선택 입장을 관리합니다. */
export function usePublicRooms() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [isJoining, setIsJoining] = useState(false)

  // F-20(AC-03): socket 참조를 **반응형으로** 구독한다. 예전에는 마운트 시점의 getSocket()에
  // 한 번 붙고, null일 때만 100ms 폴링으로 기다렸다 — 그 뒤 재로그인·재연결로 소켓
  // 인스턴스가 통째로 교체되면 새 소켓의 public_rooms_updated를 아무도 듣지 않았고(설정을
  // 바꿔도 목록이 옛 값에 머문다), 이미 남이 된 옛 소켓의 방송·조회 응답은 그대로 목록을
  // 덮었다. useMatchingRoom이 쓰는 것과 같은 구독 경계라, 소켓이 나중에 생기는 경우도
  // 폴링 없이 이 값의 변화로 처리된다.
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

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
    // F-20(AC-03): 조회와 방송은 서로 다른 통로지만 **같은 목록**을 말한다. 방송은 지금까지
    // fetchVersionRef를 건드리지 않아, 방송보다 먼저 발행된 조회의 늦은 ack이 새 목록을
    // 덮을 수 있었다(설정을 바꾼 직후 옛 정원·입장 방식이 되살아나는 경로다). 두 통로를
    // 하나의 적용 세대로 묶고, 요청 시점의 세대가 아직 유효할 때만 반영한다.
    const requestSocket = socket
    try {
      const response = await socket
        .timeout(PUBLIC_ROOM_LIST_TIMEOUT_MS)
        .emitWithAck(ROOM_LIST_SOCKET_EVENTS.GET_PUBLIC_ROOMS, {})

      // 언마운트됐거나, 그 사이 더 최근 조회·방송이 적용됐거나, 소켓이 교체됐다면 버립니다.
      if (disposedRef.current || fetchVersionRef.current !== requestVersion) return
      if (requestSocket !== getSocket()) return
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

  // 컴포넌트의 생사만 표시한다(소켓 교체와는 독립이다 — 소켓이 바뀐다고 컴포넌트가
  // 사라지는 것은 아니므로, 아래 소켓 effect의 cleanup에서 이 값을 건드리지 않는다).
  useEffect(() => {
    disposedRef.current = false
    return () => { disposedRef.current = true }
  }, [])

  useEffect(() => {
    // 소켓이 아직 없으면 붙을 곳이 없다. 생기는 순간 위 구독이 이 effect를 다시 돌린다.
    if (!socket) return undefined

    const attachedSocket = socket
    // 이 effect 인스턴스가 아직 이 소켓의 소유자인지. React가 cleanup을 실행하는 시점은
    // setSocket이 구독자에게 알린 시점보다 **뒤**라, 그 사이에 옛 소켓으로 도착한 방송이
    // 리스너 해제만으로는 막히지 않는다 — 받은 쪽이 자기 출처를 직접 확인해야 한다.
    let owned = true
    const isCurrentSource = () => owned && attachedSocket === getSocket()

    const handleRoomsUpdated = ({ rooms: nextRooms } = {}) => {
      if (!Array.isArray(nextRooms)) return
      // 이미 남이 된 소켓의 늦은 방송은 "지금 이 순간"의 목록이 아니다.
      if (!isCurrentSource()) return
      // 방송은 언제나 "지금 이 순간"의 목록이다 — 적용 세대를 올려, 이 방송보다 먼저
      // 발행돼 아직 돌아오지 않은 조회의 ack이 이 목록을 덮지 못하게 한다.
      fetchVersionRef.current += 1
      setRooms(nextRooms)
    }
    const handleRoomJoined = (room) => {
      clearJoinState()
      // matching store를 설정하기 전에 인게임 store의 이전 gameId를 먼저 무효화한다
      // (useGameSetupPage.js의 enterRoom과 동일한 이유).
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(room)
      navigate("/game-matching")
    }
    const handleRoomJoinFailed = ({ message } = {}) => {
      clearJoinState()
      alert(message ?? "공개 방에 참여할 수 없습니다.")
    }
    // Socket.IO는 재연결에 성공해도 'connect'를 다시 발생시킵니다. 끊겨 있던 동안
    // 놓친 변경분을 따라잡기 위해 재연결 시점에 목록을 다시 조회합니다.
    // 이미 교체된 옛 소켓이 뒤늦게 다시 붙은 것이라면 그 재연결은 지금 통로의 사건이 아니다.
    const handleConnect = () => {
      if (!isCurrentSource()) return
      fetchRooms()
    }

    attachedSocket.on(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, handleRoomsUpdated)
    attachedSocket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, handleRoomJoined)
    attachedSocket.on(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, handleRoomJoinFailed)
    attachedSocket.on("connect", handleConnect)
    // 새 소켓은 끊겨 있던 동안의 변경분을 모른다 — 붙자마자 자기 통로로 한 번 조회한다.
    fetchRooms()

    return () => {
      owned = false
      // 자기가 건 리스너만 같은 참조로 걷는다(같은 이벤트를 듣는 다른 구독자를 지우지 않는다).
      attachedSocket.off(ROOM_LIST_SOCKET_EVENTS.PUBLIC_ROOMS_UPDATED, handleRoomsUpdated)
      attachedSocket.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOINED, handleRoomJoined)
      attachedSocket.off(ROOM_LIST_SOCKET_EVENTS.ROOM_JOIN_FAILED, handleRoomJoinFailed)
      attachedSocket.off("connect", handleConnect)
      // 입장 잠금은 **이 소켓으로 보낸 요청**에 걸려 있다. 소켓이 교체되면 그 응답
      // (room_joined/room_join_failed)은 이 통로로 오지 않으므로, 잠금을 그대로 두면
      // 입장 버튼이 timeout이 돌 때까지 이유 없이 잠겨 있게 된다.
      clearJoinState()
    }
  }, [socket, fetchRooms, navigate, clearJoinState])

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
