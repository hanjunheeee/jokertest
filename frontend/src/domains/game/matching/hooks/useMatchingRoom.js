/**
 * GameMatchingPage 전용 훅 — 방 내 실시간 이벤트 수신과 방장 액션(시작·삭제)을 담당합니다.
 * useSocket에서 setSocket으로 공유된 소켓 인스턴스를 통해 이벤트를 등록합니다.
 *
 * custom hook: "use"로 시작하는 이름을 가진, 여러 React 훅을 조합해 재사용
 * 가능한 로직 덩어리로 묶은 함수입니다. 이 훅은 소켓 이벤트 구독·해제와
 * 방장 액션 emit을 캡슐화하고, 컴포넌트에서 바로 쓸 수 있는
 * { deleteRoom, startGame, setReady, isStarting, isSettingReady } 값을 반환합니다.
 *
 * 구독(on)하는 소켓 이벤트: player_joined_room, player_left_room,
 * host_changed, player_ready_changed, room_deleted, game_started
 * (game_started는 아직 서버가 보내지 않지만 다음 GameSession 슬라이스의 성공 방송을
 * 위해 미리 등록해 둔다)
 * 발행(emit)하는 소켓 이벤트: delete_room(deleteRoom 호출 시),
 * start_game(startGame 호출 시, ack로 응답받음), set_ready(setReady 호출 시, ack로 응답받음)
 */
import { useEffect, useRef, useState } from 'react'
import { getSocket } from '@/shared/socket/socketClient'
import { useMatchingStore } from '../store/matchingStore'
import { useInGameStore } from '../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'

// start_game/set_ready 모두 ack 기반이라 socket.timeout()으로 응답 유실(네트워크 등)에 대비한다.
const START_GAME_TIMEOUT_MS = 8000
const SET_READY_TIMEOUT_MS = 5000

// getSocket()이 null일 때(연결 준비 전/유실) 보여줄 고정 안내 문구. 내부 구현(소켓 유무)을
// 그대로 노출하지 않고, 사용자가 취할 수 있는 행동(잠시 후 재시도)만 안내한다.
const SOCKET_UNAVAILABLE_MESSAGE = '서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.'

export function useMatchingRoom({ onRoomDeleted, onGameStarted }) {
  // roomId가 바뀔 때만 리렌더링되도록 matchingStore에서 roomId 값만 구독 (selector 패턴)
  const roomId = useMatchingStore((s) => s.roomId)

  const [isStarting, setIsStarting] = useState(false)
  const [isSettingReady, setIsSettingReady] = useState(false)
  const isStartingRef = useRef(false)
  const isSettingReadyRef = useRef(false)
  const mountedRef = useRef(true)

  // 게임 시작 요청 잠금 해제를 한 곳에 모아, 성공(game_started 방송)/실패(ack)/timeout/
  // 언마운트 네 경로 모두 반드시 이 함수를 거치게 해서 해제를 빠뜨리는 경로가 생기지 않게
  // 한다. 서버가 최종 검증을 다시 하므로 이 잠금은 서버 방어를 대체하지 않는 프런트 UX
  // 보조일 뿐이다. timeout은 이제 socket.timeout()이 직접 처리하므로 별도 타이머는 없다.
  const clearStartState = () => {
    isStartingRef.current = false
    if (mountedRef.current) setIsStarting(false)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearStartState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // useEffect(setup, deps)는 "렌더링이 끝난 뒤에 실행할 부수 효과"를 등록하는
  // 훅입니다. deps 배열 안의 값이 바뀔 때마다 setup이 다시 실행되는데, 그 전에
  // 반드시 이전 setup이 반환한 cleanup 함수가 먼저 호출됩니다.
  // 여기서는 roomId가 바뀔 때(다른 방으로 이동할 때)마다 소켓 이벤트를 다시
  // 등록해야 하므로 deps에 roomId를 넣었고, 콜백 내부에서 참조하는
  // onRoomDeleted·onGameStarted도 최신 값을 쓰기 위해 함께 넣었습니다.
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !roomId) return

    const { addPlayer, removePlayer, updateHost, setPlayerReady, clearRoom } = useMatchingStore.getState()

    const handlePlayerJoinedRoom = ({ player, canStart }) => addPlayer(player, canStart)
    const handlePlayerLeftRoom = ({ uuid, canStart }) => removePlayer(uuid, canStart)
    const handleHostChanged = ({ hostUuid, canStart }) => updateHost(hostUuid, canStart)
    // 다른 참가자의 준비 상태 변경 알림이다. 본인의 변경은 setReady의 ack 응답으로 반영한다
    // (자기 자신에게는 이 이벤트가 오지 않는다 — 서버가 socket.to(roomId)로만 방송한다).
    const handlePlayerReadyChanged = ({ uuid, isReady, canStart }) => {
      setPlayerReady(uuid, isReady, canStart)
    }
    const handleRoomDeleted = () => {
      clearRoom()
      onRoomDeleted?.()
    }
    // 서버는 아직 이 이벤트를 어떤 경로로도 보내지 않는다(GameSession 미구현). 실제 성공
    // 방송이 생길 다음 슬라이스를 위해 리스너 자체는 미리 등록해 둔다.
    const handleGameStarted = (payload) => {
      clearStartState()
      useInGameStore.getState().setGamePayload(payload)
      clearRoom()
      onGameStarted?.(payload)
    }

    socket.on('player_joined_room', handlePlayerJoinedRoom)
    socket.on('player_left_room', handlePlayerLeftRoom)
    socket.on('host_changed', handleHostChanged)
    socket.on('player_ready_changed', handlePlayerReadyChanged)
    socket.on('room_deleted', handleRoomDeleted)
    socket.on('game_started', handleGameStarted)

    // cleanup: effect가 재실행되기 직전이나 컴포넌트가 사라질 때 호출되어
    // 이전에 등록한 리스너를 정리합니다. 이게 없으면 roomId가 바뀔 때마다
    // 이벤트 핸들러가 중복 등록되어 같은 이벤트가 여러 번 처리될 수 있습니다.
    // 각 off는 등록할 때와 동일한 함수 참조로 호출한다 — event명만으로 off하면 같은
    // 이벤트에 대한 다른 구독자의 리스너까지 함께 지워질 수 있다.
    return () => {
      socket.off('player_joined_room', handlePlayerJoinedRoom)
      socket.off('player_left_room', handlePlayerLeftRoom)
      socket.off('host_changed', handleHostChanged)
      socket.off('player_ready_changed', handlePlayerReadyChanged)
      socket.off('room_deleted', handleRoomDeleted)
      socket.off('game_started', handleGameStarted)
    }
  }, [roomId, onRoomDeleted, onGameStarted])

  // 방장이 "방 삭제" 버튼을 눌렀을 때 서버로 delete_room 이벤트 emit
  const deleteRoom = () => getSocket()?.emit('delete_room')

  // 방장이 "게임 시작" 버튼을 눌렀을 때 서버로 start_game을 ack로 요청한다. 서버가 최종
  // 권한·조건 검증을 다시 하므로, 여기서는 응답 오기 전 연타로 생기는 불필요한 중복
  // 요청만 줄인다(서버 방어를 대체하지 않는 프런트 UX 보조). isStarting은 성공/실패/
  // timeout 어느 경로로 끝나든 finally에서 반드시 해제한다.
  const startGame = async () => {
    if (isStartingRef.current) return
    const socket = getSocket()
    if (!socket) {
      // 소켓이 아예 없으면 요청 자체를 보낼 수 없다 — 조용히 실패하지 않고 사용자가 알 수
      // 있게 안내한다. 잠금·store는 건드리지 않는다(시도조차 하지 않았으므로).
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return
    }

    // 응답이 도착하기 전에 방을 나가거나, 다른 방으로 옮기거나, 계정이 바뀌면(재로그인 등)
    // 이 ack는 더 이상 지금 화면과 무관한 "늦은 응답"이 된다 — setReady와 같은 기준으로
    // 요청 시점의 방/사용자를 캡처해 두고, 응답이 왔을 때 그 사이 바뀌지 않았는지 다시 확인한다.
    const requestRoomId = useMatchingStore.getState().roomId
    const requestUuid = useAuthStore.getState().user?.uuid
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      const current = useMatchingStore.getState()
      if (!current.isInRoom || current.roomId !== requestRoomId) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      return false
    }

    isStartingRef.current = true
    setIsStarting(true)
    try {
      const response = await socket.timeout(START_GAME_TIMEOUT_MS).emitWithAck('start_game', {})
      if (isStaleResponse()) return

      if (!response?.ok) {
        alert(response?.message ?? '게임을 시작할 수 없습니다.')
      }
      // response.ok는 이번 슬라이스에서 항상 false다(GAME_CORE_NOT_READY 등). 실제 성공은
      // 다음 GameSession 슬라이스에서 game_started 방송으로 처리되며, 그 경로는 위의
      // handleGameStarted가 별도로 clearStartState를 호출해 잠금을 해제한다.
    } catch {
      // socket.timeout()이 던지는 타임아웃 오류다 — 서버가 보낸 구체적인 실패 사유가 아니므로
      // 일반 실패 메시지와 구분해 안내한다.
      if (!isStaleResponse()) alert('게임 시작 요청이 응답하지 않습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      // 이 요청이 소유한 잠금은 응답이 늦었더라도(이전 방의 응답이더라도) 반드시 해제한다.
      clearStartState()
    }
  }

  // 참가자가 "준비 완료/준비 취소" 버튼을 눌렀을 때 원하는 목표 상태를 서버에 요청한다.
  // set_ready는 ack 기반이라 요청 중 버튼을 잠가 중복 요청을 줄인다(여기서도 서버가
  // 최종 상태를 결정하므로 이 잠금은 UX 보조일 뿐이다).
  const setReady = async (isReady) => {
    if (isSettingReadyRef.current) return
    const socket = getSocket()
    if (!socket) {
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return
    }

    // 응답이 도착하기 전에 방을 나가거나, 다른 방으로 옮기거나, 계정이 바뀌면(재로그인 등)
    // 이 ack는 더 이상 지금 화면과 무관한 "늦은 응답"이 된다 — 요청 시점의 방/사용자를
    // 캡처해 두고, 응답이 왔을 때 그 사이 바뀌지 않았는지 다시 확인한다.
    const requestRoomId = useMatchingStore.getState().roomId
    const requestUuid = useAuthStore.getState().user?.uuid
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      const current = useMatchingStore.getState()
      if (!current.isInRoom || current.roomId !== requestRoomId) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      return false
    }

    isSettingReadyRef.current = true
    setIsSettingReady(true)
    try {
      const response = await socket.timeout(SET_READY_TIMEOUT_MS).emitWithAck('set_ready', { isReady })
      if (isStaleResponse()) return

      if (response?.ok) {
        useMatchingStore.getState().setPlayerReady(requestUuid, response.isReady, response.canStart)
      } else {
        alert(response?.message ?? '준비 상태를 변경하지 못했습니다.')
      }
    } catch {
      if (!isStaleResponse()) alert('준비 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      isSettingReadyRef.current = false
      if (mountedRef.current) setIsSettingReady(false)
    }
  }

  return { deleteRoom, startGame, setReady, isStarting, isSettingReady }
}
