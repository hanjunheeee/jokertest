// 앱 전체 효과음 연결 훅 (플레이어 만들기·범위 다시 맞추기·기본 클릭 소리·업적 소리)
// App 최상단이 한 번 부르고, 효과음 함수는 화면·스토어·시험이 이 경로로 씀
import { useEffect, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../socket/socketClient.js"
import { onAchievementGranted } from "../socket/achievementSocket.js"
import { createSfxPlayer } from "../audio/sfxPlayer.js"
import { createSfxAssetLoader } from "../audio/loadSfxAsset.js"
import { SFX_MANIFEST } from "../audio/sfxManifest.js"
import { clearActivePlayer, dispatchSfxEvent, setActivePlayer } from "../audio/sfxRuntime.js"
import { installGenericClickOwner } from "../audio/uiClickSfx.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"
import { useAuthStore } from "../../domains/auth/store/auth.store.js"
import { useNotificationsStore } from "../../domains/notifications/store/notifications.store.js"
import { useInGameStore } from "../../domains/game/ingame/store/ingameStore.js"
import { useMatchingStore } from "../../domains/game/matching/store/matchingStore.js"

// 바깥에서 쓰던 이름 그대로 다시 내보냄
export {
  dispatchSfxEvent,
  claimSfxAudio,
  getSfxMix,
  subscribeSfxMix,
  getSfxSilenceLog,
  __setSfxPlayerForTests,
} from "../audio/sfxRuntime.js"
export { dispatchUiSfx } from "../audio/uiClickSfx.js"

// 플레이어가 보는 음량·음소거·알림 켬 여부
function readSettingsForSfx() {
  const state = useSettingsStore.getState()
  return {
    masterVolume: state.volumes?.["master-volume"],
    sfxVolume: state.volumes?.["sfx-volume"],
    sfxMuted: state.sfxMuted === true,
    notifications: state.generalChecks ?? {},
  }
}

// 로그인 계정·지금 판·지금 방, 로그아웃이면 계정 null
function readScopeForSfx() {
  const auth = useAuthStore.getState()
  return {
    accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
    gameId: useInGameStore.getState().gameId ?? null,
    roomId: useMatchingStore.getState().roomId ?? null,
  }
}

export function useSfxRuntime() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 플레이어는 앱에 하나, 계정·판·방 스토어가 바뀔 때마다 범위를 다시 맞춤
  useEffect(() => {
    const player = createSfxPlayer({
      manifest: SFX_MANIFEST,
      getSettings: readSettingsForSfx,
      subscribeSettings: (listener) => useSettingsStore.subscribe(listener),
      getScope: readScopeForSfx,
      loadAsset: createSfxAssetLoader(),
      createMedia: (src) => new Audio(src),
    })
    setActivePlayer(player)

    const resync = () => player.syncScope()
    const unsubscribers = [
      useAuthStore.subscribe(resync),
      useInGameStore.subscribe(resync),
      useMatchingStore.subscribe(resync),
      installGenericClickOwner(),
    ]

    return () => {
      for (const unsubscribe of unsubscribers) {
        try {
          unsubscribe?.()
        } catch {
          // 하나가 실패해도 나머지 구독은 마저 끔
        }
      }
      player.dispose()
      clearActivePlayer(player)
    }
  }, [])

  // 업적 소리는 내 계정 것이고 알림 스토어가 처음 보는 이벤트라고 할 때만 냄
  useEffect(() => {
    if (!socket) return undefined

    const handleAchievementGranted = (payload) => {
      const envelope = payload?.sfxEvent
      if (envelope === null || typeof envelope !== "object") return
      const auth = useAuthStore.getState()
      const accountId = auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null
      if (accountId === null || envelope.accountId !== accountId) return
      if (!useNotificationsStore.getState().consumeSoundEvent(accountId, envelope.eventId)) return
      dispatchSfxEvent({ kind: envelope.kind, eventId: envelope.eventId, accountId, origin: envelope.origin })
    }

    return onAchievementGranted(socket, handleAchievementGranted)
  }, [socket])
}
