// 대기방 요청 보내기: 방 확인·게임 시작·준비·방 삭제·나가기
// hooks/room·useMatchingPage·useMatchingRoomKick이 씀
// 소켓은 부르는 쪽이 잡은 것을 받음 (응답 올 때 그 소켓이 아직 지금 소켓인지 비교하려고)
import { getSocket } from '@/shared/socket/socketClient.js'
import { CHECK_TIMEOUT_MS, READY_TIMEOUT_MS, START_TIMEOUT_MS } from '../constants/roomTiming.js'

// 지금 내 방 묻기 (응답 기다림)
export const askRoom = (socket) => socket.timeout(CHECK_TIMEOUT_MS).emitWithAck('get_current_room', {})

// 지금 내 방 묻기 (콜백으로 받음, 강퇴 전 소속 확인용)
export const askRoomCb = (socket, done) => socket.emit('get_current_room', {}, done)

// 게임 시작 요청
export const sendStart = (socket, payload) =>
  socket.timeout(START_TIMEOUT_MS).emitWithAck('start_game', payload)

// 준비 바꾸기 요청
export const sendReady = (socket, payload) =>
  socket.timeout(READY_TIMEOUT_MS).emitWithAck('set_ready', payload)

// 방 삭제·나가기: 응답 안 기다림, 지금 소켓으로 보냄
export const deleteRoom = () => getSocket()?.emit('delete_room')
export const leaveRoom = () => getSocket()?.emit('leave_room')
