import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import {
  readInGameReceiptScope,
  useInGameStore,
} from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import {
  NEXT_ROOM_SETTINGS_RESTORE_CODES,
  useNextRoomSettingsStore,
} from "../store/nextRoomSettingsStore.js"
import { buildRoomSettingsFormState } from "../utils/roomSettingsForm.js"
import {
  CREATE_ROOM_ERROR_MESSAGES,
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
  CURRENT_ROOM_TIMEOUT_MS,
  SOCKET_EVENTS,
} from "../constants/gameSetupSocket.js"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readMembershipScope() {
  const matching = useMatchingStore.getState()
  const receipt = readInGameReceiptScope()
  return {
    isInRoom: matching.isInRoom === true,
    roomId: matching.roomId ?? null,
    roomInstanceId: matching.roomInstanceId ?? null,
    gameId: receipt.gameId,
    membershipId: receipt.membershipId,
    membershipEpoch: receipt.membershipEpoch,
  }
}

function isSameMembershipScope(a, b) {
  if (a === null || typeof a !== "object" || b === null || typeof b !== "object") return false
  return a.isInRoom === b.isInRoom
    && a.roomId === b.roomId
    && a.roomInstanceId === b.roomInstanceId
    && a.gameId === b.gameId
    && a.membershipId === b.membershipId
    && a.membershipEpoch === b.membershipEpoch
}

export function useGameSetupPage() {
  const navigate = useNavigate()

  const [uiVisible, setUiVisible] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const isCreatingRef = useRef(false)
  const mountedRef = useRef(true)

  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration)
  const readRestoreSource = useNextRoomSettingsStore((s) => s.readRestoreSource)

  const restore = useMemo(() => {
    if (!accountId) return { formState: null, resetKey: `none:${identityGeneration}`, notice: "" }
    const read = readRestoreSource(accountId)
    const key = `${accountId}:${identityGeneration}:${read.code}`

    if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.NONE
      || read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED) {
      return { formState: null, resetKey: key, notice: "" }
    }
    if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED_PERSIST_FAILED) {
      return {
        formState: null,
        resetKey: key,
        notice: "설정 유지 해제를 저장하지 못했습니다. 이 화면은 기본값으로 시작하지만 새로고침하면 이전 설정이 다시 보일 수 있습니다.",
      }
    }
    if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.CORRUPTED) {
      return {
        formState: null,
        resetKey: key,
        notice: "저장된 다음 게임 설정을 불러오지 못해 기본값으로 시작합니다.",
      }
    }
    if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.STORAGE_UNAVAILABLE) {
      return {
        formState: null,
        resetKey: key,
        notice: "이 브라우저에서는 설정을 저장·복원할 수 없어 기본값으로 시작합니다.",
      }
    }

    const form = buildRoomSettingsFormState(read.source)
    if (!form.ok) {
      return {
        formState: null,
        resetKey: `${key}:form-${form.code}`,
        notice: "저장된 다음 게임 설정을 이 화면에서 표현할 수 없어 기본값으로 시작합니다.",
      }
    }
    return {
      formState: form,
      resetKey: `${key}:${read.source.settingsVersion ?? ""}`,
      notice: read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.SANITIZE_WRITE_FAILED
        ? "저장된 설정을 정리해 복원했지만 정리된 값을 다시 저장하지 못했습니다."
        : "",
    }
  }, [accountId, identityGeneration, readRestoreSource])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const showError = (message) => {
    if (!mountedRef.current) return
    alert(message ?? CREATE_ROOM_ERROR_MESSAGES.NETWORK)
  }

  const requestScopeRef = useRef(null)
  const captureRequestScope = (socket) => ({
    token: {},
    accountId,
    identityGeneration,
    socket,
    socketId: socket?.id ?? null,
    membership: readMembershipScope(),
  })

  const isScopeCurrent = (scope) => {
    if (scope === null || requestScopeRef.current !== scope) return false
    const auth = useAuthStore.getState()
    if ((auth.user?.uuid ?? null) !== scope.accountId) return false
    if (auth.identityGeneration !== scope.identityGeneration) return false
    const socket = getSocket()
    if (socket !== scope.socket) return false
    if ((socket?.id ?? null) !== scope.socketId) return false
    return isSameMembershipScope(readMembershipScope(), scope.membership)
  }

  const enterRoom = (room, scope = null) => {
    if (scope !== null && !isScopeCurrent(scope)) return
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().setRoom(room)
    if (!mountedRef.current) return
    navigate("/game-matching")
  }

  const recoverCurrentRoom = async (scope) => {
    const socket = scope?.socket ?? null
    if (!socket || !isScopeCurrent(scope)) {
      showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
      return
    }

    for (let attempt = 0; attempt < CURRENT_ROOM_MAX_POLL_ATTEMPTS; attempt += 1) {
      if (!isScopeCurrent(scope)) return
      try {
        const res = await socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})
        if (!isScopeCurrent(scope)) return

        if (res?.ok && res.room) {
          enterRoom(res.room, scope)
          return
        }

        if (res?.ok && res.pending) {
          await wait(CURRENT_ROOM_POLL_INTERVAL_MS)
          continue
        }

        break
      } catch {
        break
      }
    }

    showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
  }

  const createGame = async (settings) => {
    if (isCreatingRef.current) return
    const socket = getSocket()
    if (!socket) {
      showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
      return
    }

    isCreatingRef.current = true
    setIsCreating(true)
    const scope = captureRequestScope(socket)
    requestScopeRef.current = scope

    try {
      const response = await socket.timeout(CREATE_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.CREATE_ROOM, settings)
      if (!isScopeCurrent(scope)) return

      if (!response.ok) {
        showError(response.message)
        return
      }

      enterRoom(response.room, scope)
    } catch {
      if (!isScopeCurrent(scope)) return
      await recoverCurrentRoom(scope)
    } finally {
      if (requestScopeRef.current === scope) {
        requestScopeRef.current = null
        isCreatingRef.current = false
        if (mountedRef.current) setIsCreating(false)
      }
    }
  }

  const goBackToMultiplay = () => {
    if (isCreatingRef.current) {
      const confirmed = window.confirm(
        "방 생성 요청이 진행 중입니다. 방이 생성될 수 있지만 현재 화면에서 나가시겠습니까?"
      )
      dispatchUiSfx(confirmed ? "ui-confirm" : "ui-cancel")
      if (!confirmed) return
      navigate("/multiplay")
      return
    }
    dispatchUiSfx("ui-cancel")
    navigate("/multiplay")
  }

  return {
    uiVisible,
    isCreating,
    goBackToMultiplay,
    createGame,
    initialFormState: restore.formState,
    formResetKey: restore.resetKey,
    restoreNotice: restore.notice,
  }
}
