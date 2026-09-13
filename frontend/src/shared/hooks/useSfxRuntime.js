/**
 * F-16 공통 효과음 런타임.
 *
 * App 수명 동안 재생기 하나만 살아 있게 하고(useSfxRuntime), 화면 어디서든 같은 재생기에
 * 사건을 보낼 수 있게 모듈 수준 함수를 내보낸다(dispatchSfxEvent / dispatchUiSfx).
 * 소켓 훅들은 React context가 아니라 이 함수를 쓴다 — 훅 트리 위치와 무관하게 같은 중복
 * 판정·같은 볼륨을 쓰기 위해서다.
 *
 * 런타임이 아직 설치되지 않았으면(App 밖에서 훅만 마운트하는 시험 등) 모든 dispatch는
 * no-runtime으로 억제된다 — 조용히 던지거나 업무 경로를 막지 않는다(AC-06).
 *
 * import 경로는 전부 상대 경로다. 이 모듈은 useGameSessionSocketEvents의 import 체인에
 * 들어가는데, 그 훅은 node:test에서 실제로 마운트되고 `@/` 별칭은 vite만 해석할 수 있다.
 */
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

/** 활성 재생기. App이 마운트되어 있는 동안에만 채워진다. */
let activePlayer = null

const NO_RUNTIME = Object.freeze({
  status: "suppressed",
  reason: SFX_SUPPRESSED_REASON.NO_RUNTIME,
  completion: Promise.resolve("stopped"),
})

/** 사건 하나를 공통 재생기로 보낸다. 동기 반환이며 절대 던지지 않는다. */
export function dispatchSfxEvent(event) {
  if (activePlayer === null) return NO_RUNTIME
  try {
    return activePlayer.dispatch(event)
  } catch {
    // 재생기 내부 예외가 업무 콜백(상태 반영·ACK)으로 전파되지 않게 마지막 방어선을 둔다.
    return NO_RUNTIME
  }
}

/** F-27 영상 내장음이 쓸 소유권 선점. 런타임이 없으면 아무 것도 붙이지 않는다. */
export function claimSfxAudio(event, options) {
  if (activePlayer === null) {
    return { status: "suppressed", reason: SFX_SUPPRESSED_REASON.NO_RUNTIME, attach: () => {}, release: () => {} }
  }
  try {
    return activePlayer.claimAudio(event, options)
  } catch {
    return { status: "suppressed", reason: SFX_SUPPRESSED_REASON.NO_RUNTIME, attach: () => {}, release: () => {} }
  }
}

/** { gain, muted } — 후속 영상 내장음도 이 값을 그대로 쓴다(AC-03). */
export function getSfxMix() {
  if (activePlayer === null) return { gain: 0, muted: true }
  try {
    return activePlayer.getMix()
  } catch {
    return { gain: 0, muted: true }
  }
}

/** mix 변경 구독. 해제 함수를 돌려준다. */
export function subscribeSfxMix(listener) {
  if (activePlayer === null) return () => {}
  try {
    return activePlayer.subscribeMix(listener)
  } catch {
    return () => {}
  }
}

/** 무음 사유 기록(증거 수집용). */
export function getSfxSilenceLog() {
  if (activePlayer === null) return []
  try {
    return activePlayer.getSilenceLog()
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// UI 입력 소유권
// ---------------------------------------------------------------------------

/** 물리 활성화 단위 ID. 같은 native event는 한 번만 소비된다. */
let uiActionSeq = 0
const consumedNativeEvents = new WeakSet()

// 명시 콜백이 소유하는 버튼은 실제 DOM에서 data-sfx-owner="explicit"로 제외한다.
function nextUiActionId(prefix) {
  uiActionSeq += 1
  return `${prefix}:${uiActionSeq}`
}

/** SyntheticEvent가 감싼 native Event를 꺼낸다(둘 다 같은 물리 입력이다). */
function resolveNativeEvent(candidate) {
  if (candidate === null || typeof candidate !== "object") return null
  if (candidate.nativeEvent !== null && typeof candidate.nativeEvent === "object") return candidate.nativeEvent
  return candidate
}

/**
 * 명시 소유자(data-sfx-owner="explicit")가 직접 부르는 입구. 같은 물리 입력에 대해 한 번만
 * 소리를 낸다 — 겹친 리스너(backdrop + Escape 등)가 같은 native Event를 공유하면 두 번째는
 * 조용히 무시된다. 이벤트가 없는 native confirm 결과는 호출마다 단일 actionId를 발급한다.
 *
 * @param {'ui-click'|'ui-confirm'|'ui-cancel'} kind
 * @param {object} [event] React SyntheticEvent 또는 native Event. 없으면 호출 자체가 1건이다.
 */
export function dispatchUiSfx(kind, event) {
  const native = resolveNativeEvent(event)
  if (native !== null) {
    if (consumedNativeEvents.has(native)) return NO_RUNTIME
    consumedNativeEvents.add(native)
  }
  return dispatchSfxEvent({ kind, eventId: nextUiActionId(kind), origin: "live" })
}

/** 활성화로 소리를 낼 수 있는 제어인지. 키보드가 만든 click도 여기로 들어온다. */
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

/** submit 제어는 form submit 경계가 소유한다 — 클릭으로 한 번 더 울리지 않는다. */
function isSubmitControl(node) {
  const tag = typeof node.tagName === "string" ? node.tagName.toLowerCase() : ""
  const type = (node.getAttribute?.("type") ?? "").toLowerCase()
  if (tag === "button") return type === "submit" || (type === "" && node.form != null)
  if (tag === "input") return type === "submit"
  return false
}

/**
 * document capture click 단일 소유자. composedPath에서 가장 가까운 활성 제어를 고르고,
 * 그 경로에 data-sfx-owner="explicit"가 하나라도 있으면 무조건 제외한다.
 */
function findGenericOwner(nativeEvent) {
  const path =
    typeof nativeEvent.composedPath === "function"
      ? nativeEvent.composedPath()
      : [nativeEvent.target].filter(Boolean)

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

function installGenericClickOwner() {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return () => {}

  const handleCapture = (nativeEvent) => {
    try {
      if (consumedNativeEvents.has(nativeEvent)) return
      const control = findGenericOwner(nativeEvent)
      if (control === null) return
      consumedNativeEvents.add(nativeEvent)
      // 의미 표식이 있으면 그 의미로, 없으면 일반 클릭으로 낸다.
      const semantic = control.getAttribute?.("data-sfx-kind")
      const kind = semantic === "ui-confirm" || semantic === "ui-cancel" ? semantic : "ui-click"

      dispatchSfxEvent({ kind, eventId: nextUiActionId(kind), origin: "live" })
    } catch {
      // 소리는 어떤 경우에도 업무 콜백을 막지 않는다.
    }
  }

  document.addEventListener("click", handleCapture, true)
  return () => document.removeEventListener("click", handleCapture, true)
}

// ---------------------------------------------------------------------------
// 런타임 설치
// ---------------------------------------------------------------------------

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
    // 로그인 상태가 아니면 서버 사건을 받아들이지 않는다(익명 범위).
    accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
    gameId: useInGameStore.getState().gameId ?? null,
    roomId: useMatchingStore.getState().roomId ?? null,
  }
}

/** 시험이 재생기를 직접 갈아끼울 수 있게 한다(런타임 코드에서는 쓰지 않는다). */
export function __setSfxPlayerForTests(player) {
  activePlayer = player ?? null
}

/**
 * App이 한 번만 호출한다. 공통 재생기를 만들어 설정·인증·게임/방 범위 변경과 실제 UI 입력을
 * 재생기 계약에 연결하고, 언마운트 때 전부 정리한다.
 */
export function useSfxRuntime() {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  useEffect(() => {
    const player = createSfxPlayer({
      manifest: SFX_MANIFEST,
      getSettings: readSettingsForSfx,
      subscribeSettings: (listener) => useSettingsStore.subscribe(listener),
      getScope: readScopeForSfx,
      // 자산 로더(AC-02). 실제 바이트를 받아 SHA-256을 계산하고 검토 기록과 대조한 뒤,
      // **같은 바이트**로 만든 blob URL만 매체에 넘긴다 — 경로만 같고 내용이 바뀐 자산은
      // 여기서 걸러진다. 현재 manifest는 모든 항목이 미검토라 재생기가 그 전에 이미
      // 거부하므로 이 경로에 도달하지 않지만, 로더는 자산 승인과 무관하게 완성돼 있다.
      loadAsset: createSfxAssetLoader(),
      createMedia: (src) => new Audio(src),
    })
    activePlayer = player

    // 계정·게임·방이 바뀌면 진행 중이던 로드·재생을 중단하고 종료된 범위의 표식을 정리한다.
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
          // 정리 실패가 나머지 정리를 막지 않는다.
        }
      }
      player.dispose()
      if (activePlayer === player) activePlayer = null
    }
  }, [])

  // 업적 지급 통지(AC-01). 계정 전역 사건이라 특정 화면이 아니라 앱 수명에 붙인다 — 지급은
  // 게임 종료·낮 투표 직후 서버에서 일어나고, 그때 사용자가 어느 화면에 있든 같은 사건이다.
  // 업적 **목록 조회**(getStatusForUser)는 이 경로와 무관하며 소리를 만들지 않는다(A-05).
  useEffect(() => {
    if (!socket) return undefined

    const handleAchievementGranted = (payload) => {
      const envelope = payload?.sfxEvent
      if (envelope === null || typeof envelope !== "object") return
      const auth = useAuthStore.getState()
      const accountId = auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null
      if (accountId === null || envelope.accountId !== accountId) return
      // F-17(A-04): 업적 사건의 eventId(achievement:<id>:granted)는 서버가 저장한 알림
      // source_key와 같은 문자열이다. 목록 복원에서 이미 본 지급이면 여기서 false가 되어
      // 무음이다 — 재접속·재로그인 뒤 놓친 전달이 다시 와도 다시 울리지 않는다.
      if (!useNotificationsStore.getState().consumeSoundEvent(accountId, envelope.eventId)) return
      dispatchSfxEvent({ kind: envelope.kind, eventId: envelope.eventId, accountId, origin: envelope.origin })
    }

    socket.on("achievement_granted", handleAchievementGranted)
    return () => socket.off("achievement_granted", handleAchievementGranted)
  }, [socket])
}
