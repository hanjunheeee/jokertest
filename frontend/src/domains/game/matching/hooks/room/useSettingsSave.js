// 방장 설정 저장, 응답 못 받은 저장의 결과 확인
// hooks/room/useRoom이 씀
// 응답을 못 받으면 저장됐는지 모르므로 pending으로 남기고, 결과 확인 전에는 다시 저장 못 하게 막음
import { getSocket } from '@/shared/socket/socketClient.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import {
  ROOM_SETTINGS_ERROR_CODES,
  ROOM_SETTINGS_ERROR_MESSAGES,
} from '@/domains/game/shared/constants/gameSetupSocket.js'
import { buildUpdateRoomSettingsPayload } from '@/domains/game/setup/utils/roomSettingsForm/updatePayload.js'
import { GAME_START_MESSAGES } from '../../constants/gameStartMessages.js'
import { ROOM_MESSAGES } from '../../constants/roomMessages.js'
import { isNewerRoom } from '../../utils/roomVersion.js'
import { canSend, newRequestId } from '../../utils/request.js'
import { askSettingsResult, sendSettings } from '../../socket/settings.js'

// 결과 모름 오류
const unknownError = () => ({
  code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN,
  message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN,
})

export function useSettingsSave(ctx) {
  const {
    syncStatus, pending, savingRef, settingsVerRef, memberGenRef, applyGenRef, mountedRef, inFlightRef,
    setIsSaving, setPending, setSettingsError, setNotice, resync, bump, clearSaving,
  } = ctx

  // 설정 저장: 결과를 { ok, code } 로 돌려줌 (화면이 패널 닫을지 정함)
  const saveRoomSettings = async (formState) => {
    // 저장 중·연결 없음·방 확인 전·결과 확인 대기 중이면 안 보냄
    if (savingRef.current) return { ok: false, code: 'BUSY' }
    const socket = getSocket()
    if (!canSend(socket)) {
      alert(GAME_START_MESSAGES.SOCKET_UNAVAILABLE)
      return { ok: false, code: 'OFFLINE' }
    }
    if (syncStatus !== 'verified') {
      alert(ROOM_MESSAGES.CHECKING)
      return { ok: false, code: 'NOT_VERIFIED' }
    }
    if (pending) {
      alert(ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN)
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    }

    // 방장만, 설정 버전 알 때만
    const { roomId, settingsVersion, hostUuid } = useMatchingStore.getState()
    const uuid = useAuthStore.getState().user?.uuid
    if (!roomId || !Number.isSafeInteger(settingsVersion) || hostUuid !== uuid) {
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.NOT_HOST }
    }

    const requestId = newRequestId()
    const payload = buildUpdateRoomSettingsPayload({
      ...formState,
      roomId,
      requestId,
      expectedSettingsVersion: settingsVersion,
    })

    // 보낼 때 값 잡아 둠, 날아가는 요청으로 표시 (끊기면 결과 확인 대상)
    settingsVerRef.current += 1
    const ver = settingsVerRef.current
    const reqSocket = socket
    const member = memberGenRef.current
    const applyGen = applyGenRef.current
    inFlightRef.current = { roomId, requestId }
    const isStale = () => {
      if (!mountedRef.current) return true
      if (ver !== settingsVerRef.current) return true
      if (reqSocket !== getSocket()) return true
      if (useAuthStore.getState().user?.uuid !== uuid) return true
      if (member !== memberGenRef.current) return true
      if (useMatchingStore.getState().roomId !== roomId) return true
      return false
    }
    // 그사이 다른 방 반영이 없었는지 (실패 응답에 실린 방을 그대로 넣어도 되는지)
    const isFresh = () => applyGenRef.current === applyGen

    savingRef.current = true
    setIsSaving(true)
    setSettingsError(null)
    setNotice(null)
    try {
      const response = await sendSettings(reqSocket, payload)
      if (isStale()) return { ok: false, code: 'STALE' }

      if (mountedRef.current) {
        setPending((prev) => (prev?.requestId === requestId ? null : prev))
      }

      // 성공: 서버 버전이 더 새것이면 방 다시 확인 (설정 바뀜 방송보다 응답이 먼저 올 수 있음)
      if (response?.ok) {
        if (Number.isSafeInteger(response.settingsVersion)) {
          const current = useMatchingStore.getState()
          if (current.roomId === roomId && (current.settingsVersion ?? 0) < response.settingsVersion) {
            resync()
          }
        }
        return { ok: true, changed: response.changed === true }
      }

      // 실패: 응답에 실린 방이 믿을 만하면 넣고, 아니면 더 새 버전일 때만 방 다시 확인
      if (response?.room && isFresh()
        && useMatchingStore.getState().roomId === response.room.roomId) {
        useMatchingStore.getState().setRoom(response.room)
        bump()
      } else if (isNewerRoom(response?.room, useMatchingStore.getState())) {
        resync()
      }
      setSettingsError({ code: response?.code ?? ROOM_SETTINGS_ERROR_CODES.INTERNAL_ERROR, message: response?.message })
      return { ok: false, code: response?.code }
    } catch {
      // 응답 못 받음: 결과 확인 대기로 남김
      if (!isStale()) {
        setPending({ roomId, requestId })
        setSettingsError(unknownError())
      }
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    } finally {
      if (inFlightRef.current?.requestId === requestId) {
        inFlightRef.current = null
      }
      if (ver === settingsVerRef.current) clearSaving()
    }
  }

  // 결과 확인: 응답 못 받은 저장이 됐는지 서버에 물음
  const verifyRoomSettingsResult = async () => {
    const asked = pending
    if (!asked) return { ok: false, code: 'NO_PENDING' }
    const socket = getSocket()
    if (!canSend(socket)) {
      alert(GAME_START_MESSAGES.SOCKET_UNAVAILABLE)
      return { ok: false, code: 'OFFLINE' }
    }

    const uuid = useAuthStore.getState().user?.uuid
    settingsVerRef.current += 1
    const ver = settingsVerRef.current
    const reqSocket = socket
    const member = memberGenRef.current
    const applyGen = applyGenRef.current
    const isStale = () =>
      !mountedRef.current
      || ver !== settingsVerRef.current
      || reqSocket !== getSocket()
      || useAuthStore.getState().user?.uuid !== uuid
      || member !== memberGenRef.current
    const isFresh = () => applyGenRef.current === applyGen

    savingRef.current = true
    setIsSaving(true)
    try {
      const response = await askSettingsResult(reqSocket, asked)
      if (isStale()) return { ok: false, code: 'STALE' }
      if (!response?.ok) return { ok: false, code: response?.code ?? ROOM_SETTINGS_ERROR_CODES.UNKNOWN }

      // 응답에 실린 방이 믿을 만하면 넣음
      const applied = Boolean(response.room) && isFresh()
        && response.room.roomId === useMatchingStore.getState().roomId
      if (applied) {
        useMatchingStore.getState().setRoom(response.room)
        bump()
      }

      // 서버도 모름: 안내 띄우고 방 다시 확인
      if (response.status === 'UNKNOWN') {
        setSettingsError(null)
        setPending(null)
        setNotice(ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNRESOLVED)
        resync()
        return { ok: true, status: 'UNKNOWN' }
      }

      setPending(null)
      setSettingsError(null)
      setNotice(null)

      // 방을 못 넣었으면 방 다시 확인 (실린 방이 옛것이고 더 새 버전도 아니면 생략)
      if (!applied
        && (!response.room || isFresh() || isNewerRoom(response.room, useMatchingStore.getState()))) {
        resync()
      }
      return { ok: true, status: response.status, settingsVersion: response.settingsVersion }
    } catch {
      if (!isStale()) {
        setSettingsError(unknownError())
      }
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    } finally {
      if (ver === settingsVerRef.current) clearSaving()
    }
  }

  return { saveRoomSettings, verifyRoomSettingsResult }
}
