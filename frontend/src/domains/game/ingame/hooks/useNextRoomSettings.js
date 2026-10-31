import { useCallback, useEffect, useMemo, useRef } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import {
  NEXT_ROOM_SETTINGS_STATUS,
  useNextRoomSettingsStore,
} from "@/domains/game/setup/store/nextRoomSettingsStore.js"
import { useInGameStore } from "../store/ingameStore.js"

export const NEXT_ROOM_SETTINGS_AVAILABILITY = Object.freeze({
  READY: "READY",
  NO_ACCOUNT: "NO_ACCOUNT",
  NOT_PARTICIPATING: "NOT_PARTICIPATING",
  AWAITING_SOURCE: "AWAITING_SOURCE",
  SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
})

const STATUS_MESSAGES = Object.freeze({
  [NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED]:
    "다음 게임 설정을 저장하지 못했습니다. 다시 시도해주세요.",
  [NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED]:
    "설정 유지 해제를 저장하지 못했습니다. 새로고침하면 이전 설정이 다시 보일 수 있습니다. 다시 시도해주세요.",
})

const AVAILABILITY_MESSAGES = Object.freeze({
  [NEXT_ROOM_SETTINGS_AVAILABILITY.AWAITING_SOURCE]: "방 설정을 불러오는 중입니다. 잠시 후 다시 시도해주세요.",
  [NEXT_ROOM_SETTINGS_AVAILABILITY.SOURCE_UNAVAILABLE]:
    "이 게임의 방 설정을 확인할 수 없어 다음 게임으로 유지할 수 없습니다.",
  [NEXT_ROOM_SETTINGS_AVAILABILITY.NOT_PARTICIPATING]: "이 게임의 참가자만 설정을 유지할 수 있습니다.",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function useNextRoomSettings() {
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration)

  const gameId = useInGameStore((s) => s.gameId)
  const roomSettingsSource = useInGameStore((s) => s.state?.roomSettingsSource ?? null)
  const selfUuid = useInGameStore((s) => s.state?.self?.uuid ?? null)
  const players = useInGameStore((s) => s.state?.players ?? null)

  const storeAccountId = useNextRoomSettingsStore((s) => s.accountId)
  const enabled = useNextRoomSettingsStore((s) => s.enabled)
  const status = useNextRoomSettingsStore((s) => s.status)
  const selectionGeneration = useNextRoomSettingsStore((s) => s.selectionGeneration)
  const setAccount = useNextRoomSettingsStore((s) => s.setAccount)
  const keepSettings = useNextRoomSettingsStore((s) => s.keepSettings)
  const clearSettings = useNextRoomSettingsStore((s) => s.clearSettings)
  const retryPersist = useNextRoomSettingsStore((s) => s.retryPersist)

  useEffect(() => {
    setAccount(accountId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, identityGeneration])

  const isParticipating = useMemo(() => {
    if (!accountId || !gameId || !Array.isArray(players)) return false
    if (selfUuid !== accountId) return false
    const me = players.find((player) => player?.uuid === accountId)
    return Boolean(me) && me.isParticipating !== false
  }, [accountId, gameId, players, selfUuid])

  const availability = useMemo(() => {
    if (!accountId) return NEXT_ROOM_SETTINGS_AVAILABILITY.NO_ACCOUNT
    if (!isParticipating) return NEXT_ROOM_SETTINGS_AVAILABILITY.NOT_PARTICIPATING
    if (roomSettingsSource === null) return NEXT_ROOM_SETTINGS_AVAILABILITY.AWAITING_SOURCE
    if (!isPlainObject(roomSettingsSource) || !isPlainObject(roomSettingsSource.settings)) {
      return NEXT_ROOM_SETTINGS_AVAILABILITY.SOURCE_UNAVAILABLE
    }
    return NEXT_ROOM_SETTINGS_AVAILABILITY.READY
  }, [accountId, isParticipating, roomSettingsSource])

  const isAccountScopeCurrent = Boolean(accountId) && storeAccountId === accountId

  const canToggle = availability === NEXT_ROOM_SETTINGS_AVAILABILITY.READY && isAccountScopeCurrent
  const canDisable = isAccountScopeCurrent

  const refreshedKeyRef = useRef(null)
  useEffect(() => {
    if (!enabled || !canToggle || !gameId) return
    const key = `${accountId}:${gameId}:${selectionGeneration}`
    if (refreshedKeyRef.current === key) return
    refreshedKeyRef.current = key
    keepSettings({ accountId, source: roomSettingsSource })
  }, [enabled, canToggle, gameId, accountId, selectionGeneration, roomSettingsSource, keepSettings])

  const setKeepSettings = useCallback(
    (next) => {
      if (next) {
        if (!canToggle) return { ok: false, status }
        return keepSettings({ accountId, source: roomSettingsSource })
      }
      if (!canDisable) return { ok: false, status }
      return clearSettings({ accountId })
    },
    [canToggle, canDisable, accountId, roomSettingsSource, keepSettings, clearSettings, status],
  )

  const retry = useCallback(() => retryPersist(), [retryPersist])

  const failed = status === NEXT_ROOM_SETTINGS_STATUS.SAVE_FAILED
    || status === NEXT_ROOM_SETTINGS_STATUS.CLEAR_FAILED

  return {
    enabled,
    canToggle,
    canDisable,
    availability,
    setKeepSettings,
    status,
    statusMessage: STATUS_MESSAGES[status] ?? AVAILABILITY_MESSAGES[availability] ?? "",
    canRetry: failed,
    retry,
  }
}
