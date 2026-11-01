// 화면 버튼 소리 (직접 부르는 dispatchUiSfx와 화면 전체 클릭을 잡는 기본 클릭 소리)
// useSfxRuntime 훅이 기본 클릭 소리를 걸고, 화면 컴포넌트가 useSfxRuntime.js 경로로 dispatchUiSfx를 씀
import { findGenericOwner } from "../utils/sfx/clickControl.js"
import { NO_RUNTIME, dispatchSfxEvent } from "./sfxRuntime.js"

let uiActionSeq = 0
// 한 클릭에 소리가 두 번 나지 않게 이미 처리한 클릭을 적어 둠
const consumedNativeEvents = new WeakSet()

function nextUiActionId(prefix) {
  uiActionSeq += 1
  return `${prefix}:${uiActionSeq}`
}

// React 합성 이벤트면 안의 원래 이벤트를 꺼냄
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

// 캡처 단계에서 클릭을 먼저 봄, 따로 소리를 정한 버튼(data-sfx-kind)은 확인·취소 소리를 냄
export function installGenericClickOwner() {
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
      // 소리 때문에 클릭 처리가 깨지지 않게 무시함
    }
  }

  document.addEventListener("click", handleCapture, true)
  return () => document.removeEventListener("click", handleCapture, true)
}
