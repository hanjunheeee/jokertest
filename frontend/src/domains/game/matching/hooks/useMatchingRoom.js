/**
 * GameMatchingPage 전용 훅 — 방 내 실시간 이벤트 수신과 방장 액션(시작·삭제)을 담당합니다.
 * useSocket에서 setSocket으로 공유된 소켓 인스턴스를 통해 이벤트를 등록합니다.
 */
import { useEffect } from 'react'
import { getSocket } from '@/shared/socket/socketClient'
import { useMatchingStore } from '../store/matchingStore'

export function useMatchingRoom({ onRoomDeleted, onGameStarted }) {
  const roomId = useMatchingStore((s) => s.roomId)

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

    return () => {
      socket.off('player_joined_room')
      socket.off('player_left_room')
      socket.off('host_changed')
      socket.off('room_deleted')
      socket.off('game_started')
    }
  }, [roomId, onRoomDeleted, onGameStarted])

  const deleteRoom = () => getSocket()?.emit('delete_room')
  const startGame  = () => getSocket()?.emit('start_game')

  return { deleteRoom, startGame }
}
