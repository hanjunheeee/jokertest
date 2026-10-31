// 소리 재생 화면의 상태·부수 효과·사용자 동작을 묶은 훅이다. 화면 컴포넌트는 이 모듈이 제공하는 값과 처리 함수를 연결한다.
// 모듈 사용처: frontend/src/app/App.jsx /
// frontend/src/domains/auth/components/AuthScene/AuthFrame.jsx

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

// activePlayer: 현재 사용 중인 참가자 값
let activePlayer = null

// NO_RUNTIME: 호출한 freeze에서 받은 처리 결과
const NO_RUNTIME = Object.freeze({
  status: "suppressed",
  reason: SFX_SUPPRESSED_REASON.NO_RUNTIME,
  completion: Promise.resolve("stopped"),
})

// 현재 효과음 재생기에 이벤트를 보내요. 재생기가 없거나 오류가 나면 재생하지 않아요.
// event: 발생한 이벤트
export function dispatchSfxEvent(event) {
  if (activePlayer === null) return NO_RUNTIME
  try {
    return activePlayer.dispatch(event)
  } catch {
    return NO_RUNTIME
  }
}

// event: 발생한 이벤트
// options: 선택 설정
// 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
// event: 발생한 이벤트
// options: 선택 설정
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

// 저장된 데이터나 현재 상태에서 효과음 혼합 음량을 찾아 호출한 코드가 사용할 수 있게 한다.
export function getSfxMix() {
  if (activePlayer === null) return { gain: 0, muted: true }
  try {
    return activePlayer.getMix()
  } catch {
    return { gain: 0, muted: true }
  }
}

// 효과음 혼합 음량에 필요한 이벤트 처리·구독을 연결하거나 해제한다.
// listener: 이벤트나 상태 변경을 받을 함수
export function subscribeSfxMix(listener) {
  if (activePlayer === null) return () => {}
  try {
    return activePlayer.subscribeMix(listener)
  } catch {
    return () => {}
  }
}

// 저장된 데이터나 현재 상태에서 소리 재생 정보를 찾아 호출한 코드가 사용할 수 있게 한다.
export function getSfxSilenceLog() {
  if (activePlayer === null) return []
  try {
    return activePlayer.getSilenceLog()
  } catch {
    return []
  }
}


let uiActionSeq = 0
// consumedNativeEvents: WeakSet 객체
const consumedNativeEvents = new WeakSet()

// 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
function nextUiActionId(prefix) {
  uiActionSeq += 1
  return `${prefix}:${uiActionSeq}`
}

// 현재 입력과 저장된 상태를 바탕으로 소리 재생 정보를 계산·선택한다.
// candidate: 조건을 검사할 후보 값
function resolveNativeEvent(candidate) {
  if (candidate === null || typeof candidate !== "object") return null
  if (candidate.nativeEvent !== null && typeof candidate.nativeEvent === "object") return candidate.nativeEvent
  return candidate
}

// 같은 클릭의 효과음이 중복되지 않게 확인한 뒤 재생을 요청해요.
// kind: 현재 항목의 종류
// event: 발생한 이벤트
export function dispatchUiSfx(kind, event) {
  // native: 호출한 resolveNativeEvent에서 받은 처리 결과
  const native = resolveNativeEvent(event)
  if (native !== null) {
    if (consumedNativeEvents.has(native)) return NO_RUNTIME
    consumedNativeEvents.add(native)
  }
  return dispatchSfxEvent({ kind, eventId: nextUiActionId(kind), origin: "live" })
}

// 소리 재생 정보를 확인해, 현재 요청에 사용할 수 있는 상태인지 판단한다.
function isActivatableControl(node) {
  if (node === null || typeof node !== "object" || node.nodeType !== 1) return false
  // tag: 조건에 따라 선택한 값
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : ""
  // role: 역할 값
  const role = typeof node.getAttribute === "function" ? node.getAttribute("role") : null
  if (tag === "button") return true
  if (tag === "a" && typeof node.getAttribute === "function" && node.getAttribute("href") !== null) return true
  if (tag === "input") {
      // type: 종류 처리 결과
      const type = (node.getAttribute?.("type") ?? "").toLowerCase()
    return type === "button" || type === "checkbox" || type === "radio"
  }
  return role === "button" || role === "checkbox" || role === "radio" || role === "menuitem" || role === "tab"
}

// 소리 재생 정보를 확인해, 현재 요청에 사용할 수 있는 상태인지 판단한다.
function isDisabledControl(node) {
  if (node.disabled === true) return true
  if (typeof node.getAttribute !== "function") return false
  if (node.getAttribute("aria-disabled") === "true") return true
  if (node.hasAttribute?.("inert")) return true
  return false
}

// 소리 재생 정보를 확인해, 현재 요청에 사용할 수 있는 상태인지 판단한다.
function isSubmitControl(node) {
  // tag: 조건에 따라 선택한 값
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : ""
  // type: 종류 처리 결과
  const type = (node.getAttribute?.("type") ?? "").toLowerCase()
  if (tag === "button") return type === "submit" || (type === "" && node.form != null)
  if (tag === "input") return type === "submit"
  return false
}

// 저장된 데이터나 현재 상태에서 소리 재생 정보를 찾아 호출한 코드가 사용할 수 있게 한다.
function findGenericOwner(nativeEvent) {
  // path: 조건에 따라 선택한 값
  const path =
    typeof nativeEvent.composedPath === "function"
      ? nativeEvent.composedPath()
      : [nativeEvent.target].filter(Boolean)

  // control: 조작 값
  let control = null
  for (const node of path) {
    if (node === null || typeof node !== "object" || node.nodeType !== 1) continue
    // 명시 소유 영역은 바깥 capture가 절대 건드리지 않는다(이중 dispatch 방지).
    if (typeof node.getAttribute === "function" && node.getAttribute("data-sfx-owner") === "explicit") return null
    if (control === null && isActivatableControl(node)) {
      if (isDisabledControl(node) || isSubmitControl(node)) return null
      control = node
    }
  }
  return control
}

// 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
function installGenericClickOwner() {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return () => {}

  // 사용자의 기준 상태 확보를 받아 소리 재생 상태와 화면에 반영한다.
  const handleCapture = (nativeEvent) => {
    try {
      if (consumedNativeEvents.has(nativeEvent)) return
      // control: 조작 처리 결과
      const control = findGenericOwner(nativeEvent)
      if (control === null) return
      consumedNativeEvents.add(nativeEvent)
      // semantic: 호출한 getAttribute에서 받은 처리 결과
      const semantic = control.getAttribute?.("data-sfx-kind")
      // kind: 현재 항목의 종류
      const kind = semantic === "ui-confirm" || semantic === "ui-cancel" ? semantic : "ui-click"

      dispatchSfxEvent({ kind, eventId: nextUiActionId(kind), origin: "live" })
    } catch {
    }
  }

  document.addEventListener("click", handleCapture, true)
  return () => document.removeEventListener("click", handleCapture, true)
}


// 저장된 데이터나 현재 상태에서 설정 대상 효과음을 찾아 호출한 코드가 사용할 수 있게 한다.
function readSettingsForSfx() {
  // state: 현재 상태
  const state = useSettingsStore.getState()
  return {
    masterVolume: state.volumes?.["master-volume"],
    sfxVolume: state.volumes?.["sfx-volume"],
    sfxMuted: state.sfxMuted === true,
    notifications: state.generalChecks ?? {},
  }
}

// 저장된 데이터나 현재 상태에서 유효 범위 대상 효과음을 찾아 호출한 코드가 사용할 수 있게 한다.
function readScopeForSfx() {
  // auth: 공용 저장소의 현재 상태와 조작 함수
  const auth = useAuthStore.getState()
  return {
    accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
    gameId: useInGameStore.getState().gameId ?? null,
    roomId: useMatchingStore.getState().roomId ?? null,
  }
}

// 테스트에서 모듈의 상태·설정·의존성을 바꿔 필요한 상황을 재현한다.
// player: 참가자 정보
export function __setSfxPlayerForTests(player) {
  activePlayer = player ?? null
}

// 소리 재생에서 사용하는 입력·상태와 조작 함수를 화면 컴포넌트에 제공한다.
export function useSfxRuntime() {
  // socket: 요청한 사용자와 데이터를 주고받는 소켓 연결
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  useEffect(() => {
    // player: 참가자 정보
    const player = createSfxPlayer({
      manifest: SFX_MANIFEST,
      getSettings: readSettingsForSfx,
      // 설정에 필요한 이벤트 처리·구독을 연결하거나 해제한다.
      // listener: 이벤트나 상태 변경을 받을 함수
      subscribeSettings: (listener) => useSettingsStore.subscribe(listener),
      getScope: readScopeForSfx,
      loadAsset: createSfxAssetLoader(),
      // 다음 단계에서 사용할 미디어를 필요한 항목으로 구성한다.
      createMedia: (src) => new Audio(src),
    })
    activePlayer = player

    // 소리 재생에서 호출받은 입력을 정리하고, 이 함수의 계산 결과를 호출한 쪽에 전달한다.
    const resync = () => player.syncScope()
    // unsubscribers: 처리에 필요한 항목 목록
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

    // 사용자의 소리 재생 정보를 받아 소리 재생 상태와 화면에 반영한다.
    // payload: 이 요청·이벤트를 보낼 때 함께 담은 데이터
    const handleAchievementGranted = (payload) => {
      // envelope: 주고받는 데이터에서 읽은 sfxEvent 항목
      const envelope = payload?.sfxEvent
      if (envelope === null || typeof envelope !== "object") return
      // auth: 공용 저장소의 현재 상태와 조작 함수
      const auth = useAuthStore.getState()
      // accountId: 사용자 계정 ID
      const accountId = auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null
      if (accountId === null || envelope.accountId !== accountId) return
      if (!useNotificationsStore.getState().consumeSoundEvent(accountId, envelope.eventId)) return
      dispatchSfxEvent({ kind: envelope.kind, eventId: envelope.eventId, accountId, origin: envelope.origin })
    }

    // "achievement_granted": 새로 지급된 업적 정보 반영. 이벤트가 도착하면 handleAchievementGranted 실행.
    // "achievement_granted" 요청·알림이 도착하면 아래 처리를 실행한다.
    socket.on("achievement_granted", handleAchievementGranted)
    return () => socket.off("achievement_granted", handleAchievementGranted)
  }, [socket])
}
