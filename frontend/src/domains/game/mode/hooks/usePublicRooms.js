// 공개 방 목록 받기·갱신 반영, 공개 방 들어가기
// MultiplayEntryPage가 씀(모바일도 같음), 소켓이 바뀌면 새 소켓에 다시 붙고 목록을 새로 물음
// 목록 묻기는 usePublicRoomList, 들어가기 요청·Node 옮기기는 usePublicRoomJoin
import { useEffect, useRef, useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket, subscribeSocket } from "@/shared/socket/socketClient.js"
import { onRoomList } from "../socket/rooms.js"
import { usePublicRoomList } from "./usePublicRoomList.js"
import { usePublicRoomJoin } from "./usePublicRoomJoin.js"
import { ROOM_JOIN_ERROR_CODES } from "../constants/roomJoinMessages.js"
import { recoverMatchingRoom } from "@/domains/game/matching/utils/recoverMatchingRoom.js"

// 붙인 소켓에 목록 갱신·입장 결과·다시 연결 방송 붙이고 목록 새로 물음, 떼는 함수 돌려줌
function attachRoomList(socket, { applyRoomList, clearJoin, failJoin, fetchRooms, navigate }) {
  // 붙인 소켓이 지금 소켓일 때만 반영
  const attachedSocket = socket
  let owned = true
  const isCurrent = () => owned && attachedSocket === getSocket()

  // 목록 갱신 방송: 받은 목록으로 바꿈
  const handleUpdated = ({ rooms: nextRooms } = {}) => {
    if (!Array.isArray(nextRooms)) return
    if (!isCurrent()) return
    applyRoomList(nextRooms)
  }
  // 입장 성공: 끝난 판 지우고 방 넣고 대기방으로
  // 내가 안 보낸 입장도 서버에선 이미 그 방 사람이라 따라감 (판 끝 뒤 서버가 끌어다 넣던 자동 입장은 없앰)
  const handleJoined = (room) => {
    if (!isCurrent()) return
    clearJoin()
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().setRoom(room)
    navigate("/game-matching")
  }
  // 입장 실패: 내가 보낸 입장 중일 때만 풀고 알림
  const handleJoinFailed = async (answer = {}) => {
    if (!isCurrent()) return
    if (answer.code === ROOM_JOIN_ERROR_CODES.ALREADY_IN_ROOM) {
      clearJoin()
      const recovered = await recoverMatchingRoom(navigate)
      if (recovered) return
    }
    failJoin(answer)
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
}

// 공개 방 목록·들어가기 상태
export function usePublicRooms() {
  const navigate = useNavigate()
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const isInRoom = useMatchingStore((s) => s.isInRoom)

  // 화면 떠남 표시 (목록 묻기·들어가기 둘 다 봄)
  const disposedRef = useRef(false)
  const { rooms, fetchRooms, applyRoomList } = usePublicRoomList(disposedRef)
  const { isJoining, clearJoin, failJoin, joinPublicRoom } = usePublicRoomJoin(disposedRef)

  // 화면 살아 있는지 표시
  useEffect(() => {
    disposedRef.current = false
    return () => { disposedRef.current = true }
  }, [])

  // 소켓 붙이기: 목록 갱신·입장 결과·다시 연결 받고 목록 새로 물음
  useEffect(() => {
    if (!socket) return undefined
    return attachRoomList(socket, { applyRoomList, clearJoin, failJoin, fetchRooms, navigate })
  }, [socket, fetchRooms, applyRoomList, navigate, clearJoin, failJoin])

  // 방 만들기 직후 스토어만 비었을 때 서버 소속이면 대기방으로 복구
  useEffect(() => {
    if (!socket?.connected || isInRoom || disposedRef.current) return undefined
    let cancelled = false
    void recoverMatchingRoom((to, opts) => {
      if (!cancelled && !disposedRef.current) navigate(to, opts)
    }).then((recovered) => {
      if (recovered && !cancelled && !disposedRef.current) clearJoin()
    })
    return () => { cancelled = true }
  }, [socket, isInRoom, navigate, clearJoin])

  return { rooms, refreshRooms: fetchRooms, joinPublicRoom, isJoining }
}
