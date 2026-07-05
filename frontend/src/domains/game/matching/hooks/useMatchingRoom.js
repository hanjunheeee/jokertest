/**
 * GameMatchingPage 전용 훅 — 방 내 실시간 이벤트 수신과 방장 액션(시작·삭제)을 담당합니다.
 * useSocket에서 setSocket으로 공유된 소켓 인스턴스를 통해 이벤트를 등록합니다.
 *
 * custom hook: "use"로 시작하는 이름을 가진, 여러 React 훅을 조합해 재사용
 * 가능한 로직 덩어리로 묶은 함수입니다. 이 훅은 소켓 이벤트 구독·해제와
 * 방장 액션 emit을 캡슐화하고, 컴포넌트에서 바로 쓸 수 있는
 * { deleteRoom, startGame } 함수만 반환합니다.
 *
 * 구독(on)하는 소켓 이벤트: player_joined_room, player_left_room,
 * host_changed, room_deleted, game_started
 * 발행(emit)하는 소켓 이벤트: delete_room(deleteRoom 호출 시),
 * start_game(startGame 호출 시)
 */
import { useEffect } from 'react'
import { getSocket } from '@/shared/socket/socketClient'
import { useMatchingStore } from '../store/matchingStore'

export function useMatchingRoom({ onRoomDeleted, onGameStarted }) {
  // roomId가 바뀔 때만 리렌더링되도록 matchingStore에서 roomId 값만 구독 (selector 패턴)
  const roomId = useMatchingStore((s) => s.roomId)

  // useEffect(setup, deps)는 "렌더링이 끝난 뒤에 실행할 부수 효과"를 등록하는
  // 훅입니다. deps 배열 안의 값이 바뀔 때마다 setup이 다시 실행되는데, 그 전에
  // 반드시 이전 setup이 반환한 cleanup 함수가 먼저 호출됩니다.
  // 여기서는 roomId가 바뀔 때(다른 방으로 이동할 때)마다 소켓 이벤트를 다시
  // 등록해야 하므로 deps에 roomId를 넣었고, 콜백 내부에서 참조하는
  // onRoomDeleted·onGameStarted도 최신 값을 쓰기 위해 함께 넣었습니다.
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !roomId) return

    const { addPlayer, removePlayer, updateHost, clearRoom } = useMatchingStore.getState()

    socket.on('player_joined_room', ({ player }) => addPlayer(player))
    socket.on('player_left_room',   ({ uuid }) => removePlayer(uuid))
    socket.on('host_changed',       ({ hostUuid }) => updateHost(hostUuid))
    socket.on('room_deleted', () => {
      clearRoom()
      onRoomDeleted?.()
    })
    socket.on('game_started', () => {
      clearRoom()
      onGameStarted?.()
    })

    // cleanup: effect가 재실행되기 직전이나 컴포넌트가 사라질 때 호출되어
    // 이전에 등록한 리스너를 정리합니다. 이게 없으면 roomId가 바뀔 때마다
    // 이벤트 핸들러가 중복 등록되어 같은 이벤트가 여러 번 처리될 수 있습니다.
    return () => {
      socket.off('player_joined_room')
      socket.off('player_left_room')
      socket.off('host_changed')
      socket.off('room_deleted')
      socket.off('game_started')
    }
  }, [roomId, onRoomDeleted, onGameStarted])

  // 방장이 "방 삭제" 버튼을 눌렀을 때 서버로 delete_room 이벤트 emit
  const deleteRoom = () => getSocket()?.emit('delete_room')
  // 방장이 "게임 시작" 버튼을 눌렀을 때 서버로 start_game 이벤트 emit
  const startGame  = () => getSocket()?.emit('start_game')

  return { deleteRoom, startGame }
}
