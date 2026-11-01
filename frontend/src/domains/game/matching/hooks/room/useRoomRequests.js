// 대기방 요청: 게임 시작·준비 바꾸기·방 삭제
// hooks/room/useRoom이 씀, 방 확인이 끝나야 보내고 응답이 옛것이면 버림
import { getSocket } from '@/shared/socket/socketClient.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { dispatchSfxEvent } from '@/shared/hooks/useSfxRuntime.js'
import { ROOM_SETTINGS_ERROR_CODES } from '@/domains/game/setup/constants/gameSetupSocket.js'
import { GAME_START_MESSAGES } from '../../constants/gameStartMessages.js'
import { ROOM_MESSAGES } from '../../constants/roomMessages.js'
import { READY_EVENT, classifyReady } from '../../utils/roomVersion.js'
import { roomSfx } from '../../utils/roomSfx.js'
import { canSend } from '../../utils/request.js'
import { deleteRoom, sendReady, sendStart } from '../../socket/room.js'

// 응답이 옛것인지 보는 검사 만들기: 보낼 때 잡은 버전·소속·소켓·방·계정이 하나라도 바뀌면 옛것
const staleCheck = (ctx, verRef, { ver, socket, roomId, uuid, member }) => () => {
  if (!ctx.mountedRef.current) return true
  if (ver !== verRef.current) return true
  if (member !== ctx.memberGenRef.current) return true
  if (socket !== getSocket()) return true
  if (!socket.connected) return true
  if (!window.navigator.onLine) return true
  const current = useMatchingStore.getState()
  if (!current.isInRoom || current.roomId !== roomId) return true
  if (useAuthStore.getState().user?.uuid !== uuid) return true
  return false
}

export function useRoomRequests(ctx) {
  const {
    syncStatus, startingRef, readyingRef, startVerRef, readyVerRef, memberGenRef, readyAggRef,
    setIsStarting, setIsSettingReady, setStartBlocked, resync, bump, clearStart, clearReady,
  } = ctx

  // 게임 시작: 막히면 안내 창 띄움
  const startGame = async () => {
    // 연타·연결 없음·방 확인 전이면 안 보냄
    if (startingRef.current) return
    const socket = getSocket()
    if (!canSend(socket)) {
      setStartBlocked(GAME_START_MESSAGES.SOCKET_UNAVAILABLE)
      return
    }
    if (syncStatus !== 'verified') {
      setStartBlocked(GAME_START_MESSAGES.ROOM_SYNC_PENDING)
      return
    }

    // 보낼 때 값 잡아 둠, 설정 버전 모르면 안 보냄
    startVerRef.current += 1
    const ver = startVerRef.current
    const { roomId, settingsVersion } = useMatchingStore.getState()
    const uuid = useAuthStore.getState().user?.uuid
    const member = memberGenRef.current
    if (!roomId || !Number.isSafeInteger(settingsVersion)) {
      setStartBlocked(GAME_START_MESSAGES.ROOM_SYNC_PENDING)
      return
    }
    const isStale = staleCheck(ctx, startVerRef, { ver, socket, roomId, uuid, member })

    startingRef.current = true
    setIsStarting(true)
    try {
      const response = await sendStart(socket, {
        roomId,
        expectedSettingsVersion: settingsVersion,
      })
      if (isStale()) return

      // 실패: 방 상태가 바뀐 거면 방 다시 확인
      if (!response?.ok) {
        if (response?.code === 'ROOM_STATE_CHANGED') resync()
        setStartBlocked(response?.message ?? GAME_START_MESSAGES.FALLBACK)
      }
    } catch {
      if (!isStale()) setStartBlocked(GAME_START_MESSAGES.REQUEST_TIMEOUT)
    } finally {
      // 내 요청이 마지막 요청일 때만 시작 중 표시 끔
      if (ver === startVerRef.current && member === memberGenRef.current) {
        clearStart()
      }
    }
  }

  // 준비 바꾸기: 실패는 alert로 알림
  const setReady = async (isReady) => {
    // 연타·연결 없음·방 확인 전이면 안 보냄
    if (readyingRef.current) return
    const socket = getSocket()
    if (!canSend(socket)) {
      alert(GAME_START_MESSAGES.SOCKET_UNAVAILABLE)
      return
    }
    if (syncStatus !== 'verified') {
      alert(ROOM_MESSAGES.CHECKING)
      return
    }

    // 보낼 때 값 잡아 둠 (준비 집계 횟수도 잡아서 응답의 canStart를 믿어도 되는지 봄)
    readyVerRef.current += 1
    const ver = readyVerRef.current
    const { roomId, settingsVersion } = useMatchingStore.getState()
    const uuid = useAuthStore.getState().user?.uuid
    const member = memberGenRef.current
    const readyAgg = readyAggRef.current
    if (!roomId || !Number.isSafeInteger(settingsVersion)) {
      alert(ROOM_MESSAGES.CHECKING)
      return
    }
    const isStale = staleCheck(ctx, readyVerRef, { ver, socket, roomId, uuid, member })

    readyingRef.current = true
    setIsSettingReady(true)
    try {
      const response = await sendReady(socket, {
        isReady,
        roomId,
        expectedSettingsVersion: settingsVersion,
      })
      if (isStale()) return

      if (response?.ok) {
        // 다른 방 응답이거나 옛 응답이면 버림, 더 새 설정이면 방 다시 확인
        const current = useMatchingStore.getState()
        if (response.roomId !== undefined && response.roomId !== current.roomId) return
        const verdict = classifyReady(current, uuid, {
          settingsVersion: response.settingsVersion, readyRevision: response.readyRevision,
        })
        if (verdict === READY_EVENT.STALE) return
        if (verdict === READY_EVENT.NEWER) {
          resync()
          return
        }
        // 그사이 다른 사람 준비가 바뀌었으면 canStart는 안 믿고 방 다시 확인
        const roomWideFresh = readyAggRef.current === readyAgg
        current.setPlayerReady(
          uuid,
          response.isReady,
          roomWideFresh ? response.canStart : undefined,
          response.readyRevision,
        )
        if (roomWideFresh) {
          bump()
        } else {
          resync()
        }
        const sfx = roomSfx('room-ready-changed', response.sfxEvent, useAuthStore.getState())
        if (sfx) dispatchSfxEvent(sfx)
      } else if (response?.code === ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT) {
        resync()
        alert(response.message ?? ROOM_MESSAGES.SETTINGS_CHANGED)
      } else {
        alert(response?.message ?? ROOM_MESSAGES.READY_FAILED)
      }
    } catch {
      if (!isStale()) alert(ROOM_MESSAGES.READY_RETRY)
    } finally {
      if (ver === readyVerRef.current && member === memberGenRef.current) {
        clearReady()
      }
    }
  }

  return { deleteRoom, startGame, setReady }
}
