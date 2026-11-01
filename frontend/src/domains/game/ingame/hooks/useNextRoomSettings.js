// 다음 판 설정 유지 훅: 이 판 방 설정을 다음 판에도 쓸지 켜고 끄기, 저장 실패면 다시 시도
// 설정 방 탭(SettingRoomTab)이 사용, 저장은 setup의 nextRoomSettingsStore가 맡음
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { SETTINGS_STATUS } from "@/domains/game/setup/constants/nextRoomSettings.js"
import { useNextRoomSettingsStore } from "@/domains/game/setup/store/nextRoomSettingsStore.js"
import { isPlainObject } from "../../shared/utils/valueChecks.js"
import { useInGameStore } from "../store/ingameStore.js"

// 설정 유지를 켤 수 있는지 상태 이름
export const SETTINGS_AVAILABILITY = Object.freeze({
  READY: "READY",
  NO_ACCOUNT: "NO_ACCOUNT",
  NOT_PARTICIPATING: "NOT_PARTICIPATING",
  AWAITING_SOURCE: "AWAITING_SOURCE",
  SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
})

// 저장·해제 실패 문구와 못 켜는 이유 문구
const STATUS_MESSAGES = Object.freeze({
  [SETTINGS_STATUS.SAVE_FAILED]:
    "다음 게임 설정을 저장하지 못했습니다. 다시 시도해주세요.",
  [SETTINGS_STATUS.CLEAR_FAILED]:
    "설정 유지 해제를 저장하지 못했습니다. 새로고침하면 이전 설정이 다시 보일 수 있습니다. 다시 시도해주세요.",
})

const AVAILABILITY_MESSAGES = Object.freeze({
  [SETTINGS_AVAILABILITY.AWAITING_SOURCE]: "방 설정을 불러오는 중입니다. 잠시 후 다시 시도해주세요.",
  [SETTINGS_AVAILABILITY.SOURCE_UNAVAILABLE]:
    "이 게임의 방 설정을 확인할 수 없어 다음 게임으로 유지할 수 없습니다.",
  [SETTINGS_AVAILABILITY.NOT_PARTICIPATING]: "이 게임의 참가자만 설정을 유지할 수 있습니다.",
})

// 켜짐·켤 수 있는지·문구와 켜고 끄기·다시 시도
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

  // 계정·신원이 바뀌면 저장소 계정을 지금 계정으로 맞춤
  useEffect(() => {
    setAccount(accountId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, identityGeneration])

  // 내가 이 판 참가자인지 (판 속 나와 계정이 같고 나가지 않음)
  const isParticipating = useMemo(() => {
    if (!accountId || !gameId || !Array.isArray(players)) return false
    if (selfUuid !== accountId) return false
    const me = players.find((player) => player?.uuid === accountId)
    return Boolean(me) && me.isParticipating !== false
  }, [accountId, gameId, players, selfUuid])

  // 계정 → 참가 → 방 설정 원본 순으로 켤 수 있는지 봄
  const availability = useMemo(() => {
    if (!accountId) return SETTINGS_AVAILABILITY.NO_ACCOUNT
    if (!isParticipating) return SETTINGS_AVAILABILITY.NOT_PARTICIPATING
    if (roomSettingsSource === null) return SETTINGS_AVAILABILITY.AWAITING_SOURCE
    if (!isPlainObject(roomSettingsSource) || !isPlainObject(roomSettingsSource.settings)) {
      return SETTINGS_AVAILABILITY.SOURCE_UNAVAILABLE
    }
    return SETTINGS_AVAILABILITY.READY
  }, [accountId, isParticipating, roomSettingsSource])

  // 저장소 계정이 지금 계정일 때만 켜고 끄기 (켜기는 원본까지 준비돼야 함)
  const isAccountScopeCurrent = Boolean(accountId) && storeAccountId === accountId

  const canToggle = availability === SETTINGS_AVAILABILITY.READY && isAccountScopeCurrent
  const canDisable = isAccountScopeCurrent

  // 켜져 있으면 판·선택 세대마다 한 번 이 판 설정으로 다시 저장
  const refreshedKeyRef = useRef(null)
  useEffect(() => {
    if (!enabled || !canToggle || !gameId) return
    const key = `${accountId}:${gameId}:${selectionGeneration}`
    if (refreshedKeyRef.current === key) return
    refreshedKeyRef.current = key
    keepSettings({ accountId, source: roomSettingsSource })
  }, [enabled, canToggle, gameId, accountId, selectionGeneration, roomSettingsSource, keepSettings])

  // 켜기는 켤 수 있을 때만 저장, 끄기는 계정이 맞을 때만 해제
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

  // 실패했던 저장·해제 다시 시도
  const retry = useCallback(() => retryPersist(), [retryPersist])

  // 저장·해제 실패면 다시 시도 버튼
  const failed = status === SETTINGS_STATUS.SAVE_FAILED
    || status === SETTINGS_STATUS.CLEAR_FAILED

  // 문구는 실패 문구 먼저, 없으면 못 켜는 이유
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
