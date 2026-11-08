// 인게임 창 공용 훅: 맨 위 창만 Esc 받기, 열 때 창 안으로 초점 옮기고 Tab 가두기, 닫으면 초점 되돌리기
// 채팅 크게 보기·투표 현황·옆 창·양피지 창·이모지 팔레트·사망 뒤 선택·재판 연출이 사용
import { useEffect, useLayoutEffect, useRef } from "react"
import { dispatchUiSfx } from "../../../../shared/hooks/useSfxRuntime.js"

// 열린 창 쌓기 순서 (마지막이 맨 위, 창마다 Esc 감시가 따로 붙어도 맨 위만 반응)
const layerStack = []

// 키보드로 갈 수 있는 것들
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",")

function isTopLayer(id) {
  return layerStack.length > 0 && layerStack[layerStack.length - 1] === id
}

function focusableIn(node) {
  if (!node || typeof node.querySelectorAll !== "function") return []
  return [...node.querySelectorAll(FOCUSABLE_SELECTOR)]
}

function focusNode(node) {
  if (node && typeof node.focus === "function") node.focus({ preventScroll: true })
}

// 열려 있는 동안 창 하나로 셈 (onClose 없으면 Esc로 안 닫힘)
export function useInGameModalLayer({
  open,
  onClose = null,
  containerRef = null,
  initialFocusRef = null,
  moveFocus = true,
  trapFocus = true,
  cancelSfx = true,
}) {
  // 닫기 함수는 늘 최신 것 (감시를 열 때 한 번만 붙이려고)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const id = Symbol("ingame-modal-layer")
    layerStack.push(id)

    // 열 때 초점 옮김 (이미 창 안에 있으면 그대로), 닫으면 원래 자리로
    const previouslyFocused = typeof document !== "undefined" ? document.activeElement : null
    const container = containerRef?.current ?? null
    if (moveFocus && container && !container.contains(document.activeElement)) {
      focusNode(initialFocusRef?.current ?? focusableIn(container)[0] ?? container)
    }

    const onKeyDown = (event) => {
      if (!isTopLayer(id)) return
      if (event.key === "Escape") {
        if (typeof onCloseRef.current !== "function") return
        if (cancelSfx) dispatchUiSfx("ui-cancel", event)
        onCloseRef.current()
        return
      }
      // Tab은 창 안에서만 돎
      if (event.key !== "Tab" || !trapFocus) return
      const node = containerRef?.current ?? null
      if (!node) return
      const items = focusableIn(node)
      if (items.length === 0) {
        event.preventDefault()
        focusNode(node)
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault()
        focusNode(last)
      } else if (!event.shiftKey && (active === last || !node.contains(active))) {
        event.preventDefault()
        focusNode(first)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      const index = layerStack.indexOf(id)
      if (index >= 0) layerStack.splice(index, 1)
      if (moveFocus && previouslyFocused && previouslyFocused.isConnected) focusNode(previouslyFocused)
    }
  }, [open, containerRef, initialFocusRef, moveFocus, trapFocus, cancelSfx])
}
