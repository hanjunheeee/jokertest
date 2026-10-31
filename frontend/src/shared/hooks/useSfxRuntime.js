import { useEffect, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../socket/socketClient.js"
import { createSfxPlayer } from "../audio/sfxPlayer.js"
import { createSfxAssetLoader } from "../audio/loadSfxAsset.js"
import { SFX_MANIFEST, SFX_SUPPRESSED_REASON } from "../audio/sfxManifest.js"
import { useSettingsStore } from "../../domains/settings/store/settingsStore.js"
import { useAuthStore } from "../../domains/auth/store/auth.store.js"
import { useNotificationsStore } from "../../domains/notifications/store/notifications.store.js"
import { useInGameStore } from "../../domains/game/ingame/store/ingameStore.js"
import { useMatchingStore } from "../../domains/game/matching/store/matchingStore.js"

let activePlayer = null

const NO_RUNTIME = Object.freeze({
  status: "suppressed",
  reason: SFX_SUPPRESSED_REASON.NO_RUNTIME,
  completion: Promise.resolve("stopped"),
})

export function dispatchSfxEvent(event) {
  if (activePlayer === null) return NO_RUNTIME
  try {
    return activePlayer.dispatch(event)
  } catch {
    return NO_RUNTIME
  }
}

export function claimSfxAudio(event, options) {
  if (activePlayer === null) {
    return { status: "suppressed", reason: SFX_SUPPRESSED_REASON.NO_RUNTIME, /* 연결에 필요한 이벤트 처리·구독을 연결하거나 해제한다. */ attach: () => {
}, /* 더는 사용하지 않을 해제를 정리하거나 해제한다. */ release: () => {
} }
  }
  try {
    return activePlayer.claimAudio(event, options)
  } catch {
    return { status: "suppressed", reason: SFX_SUPPRESSED_REASON.NO_RUNTIME, /* 연결에 필요한 이벤트 처리·구독을 연결하거나 해제한다. */ attach: () => {
}, /* 더는 사용하지 않을 해제를 정리하거나 해제한다. */ release: () => {
} }
  }
}

export function getSfxMix() {
  if (activePlayer === null) return { gain: 0, muted: true }
  try {
    return activePlayer.getMix()
  } catch {
    return { gain: 0, muted: true }
  }
}

export function subscribeSfxMix(listener) {
  if (activePlayer === null) return () => {}
  try {
    return activePlayer.subscribeMix(listener)
  } catch {
    return () => {}
  }
}

export function getSfxSilenceLog() {
  if (activePlayer === null) return []
  try {
    return activePlayer.getSilenceLog()
  } catch {
    return []
  }
}


let uiActionSeq = 0
const consumedNativeEvents = new WeakSet()

function nextUiActionId(prefix) {
  uiActionSeq += 1
  return `${prefix}:${uiActionSeq}`
}

function resolveNativeEvent(candidate) {
  if (candidate === null || typeof candidate !== "object") return null
  if (candidate.nativeEvent !== null && typeof candidate.nativeEvent === "object") return candidate.nativeEvent
  return candidate
}

export function dispatchUiSfx(kind, event) {
  const native = resolveNativeEvent(event)
  if (native !== null) {
    if (consumedNativeEvents.has(native)) return NO_RUNTIME
    consumedNativeEvents.add(native)
  }
  return dispatchSfxEvent({ kind, eventId: nextUiActionId(kind), origin: "live" })
}

function isActivatableControl(node) {
  if (node === null || typeof node !== "object" || node.nodeType !== 1) return false
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : ""
  const role = typeof node.getAttribute === "function" ? node.getAttribute("role") : null
  if (tag === "button") return true
  if (tag === "a" && typeof node.getAttribute === "function" && node.getAttribute("href") !== null) return true
  if (tag === "input") {
      const type = (node.getAttribute?.("type") ?? "").toLowerCase()
    return type === "button" || type === "checkbox" || type === "radio"
  }
  return role === "button" || role === "checkbox" || role === "radio" || role === "menuitem" || role === "tab"
}

function isDisabledControl(node) {
  if (node.disabled === true) return true
  if (typeof node.getAttribute !== "function") return false
  if (node.getAttribute("aria-disabled") === "true") return true
  if (node.hasAttribute?.("inert")) return true
  return false
}

function isSubmitControl(node) {
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : ""
  const type = (node.getAttribute?.("type") ?? "").toLowerCase()
  if (tag === "button") return type === "submit" || (type === "" && node.form != null)
  if (tag === "input") return type === "submit"
  return false
}

function findGenericOwner(nativeEvent) {
  const path =
    typeof nativeEvent.composedPath === "function"
      ? nativeEvent.composedPath()
      : [nativeEvent.target].filter(Boolean)

  let control = null
  for (const node of path) {
    if (node === null || typeof node !== "object" || node.nodeType !== 1) continue
    if (typeof node.getAttribute === "function" && node.getAttribute("data-sfx-owner") === "explicit") return null
    if (control === null && isActivatableControl(node)) {
      if (isDisabledControl(node) || isSubmitControl(node)) return null
      control = node
    }
  }
  return control
}

function installGenericClickOwner() {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return () => {}

  const handleCapture = (nativeEvent) => {
    try {
      if (consumedNativeEvents.has(nativeEvent)) return
      const control = findGenericOwner(nativeEvent)
      if (control === null) return
      consumedNativeEvents.add(nativeEvent)
      const semantic = control.getAttribute?.("data-sfx-kind")
      const kind = semantic === "ui-confirm" || semantic === "ui-cancel" ? semantic : "ui-click"

      dispatchSfxEvent({ kind, eventId: nextUiActionId(kind), origin: "live" })
    } catch {
    }
  }

  document.addEventListener("click", handleCapture, true)
  return () => document.removeEventListener("click", handleCapture, true)
}


function readSettingsForSfx() {
  const state = useSettingsStore.getState()
  return {
    masterVolume: state.volumes?.["master-volume"],
    sfxVolume: state.volumes?.["sfx-volume"],
    sfxMuted: state.sfxMuted === true,
    notifications: state.generalChecks ?? {},
  }
}

function readScopeForSfx() {
  const auth = useAuthStore.getState()
  return {
    accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
    gameId: useInGameStore.getState().gameId ?? null,
    roomId: useMatchingStore.getState().roomId ?? null,
  }
}

export function __setSfxPlayerForTests(player) {
  activePlayer = player ?? null
}

export function useSfxRuntime() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  useEffect(() => {
    const player = createSfxPlayer({
      manifest: SFX_MANIFEST,
      getSettings: readSettingsForSfx,
      subscribeSettings: (listener) => useSettingsStore.subscribe(listener),
      getScope: readScopeForSfx,
      loadAsset: createSfxAssetLoader(),
      createMedia: (src) => new Audio(src),
    })
    activePlayer = player

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
        }
      }
      player.dispose()
      if (activePlayer === player) activePlayer = null
    }
  }, [])

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

    socket.on("achievement_granted", handleAchievementGranted)
    return () => socket.off("achievement_granted", handleAchievementGranted)
  }, [socket])
}
