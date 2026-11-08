// 전역 alert → 양피지 안내 창 (데스크톱 로직의 alert 호출을 모바일에서 가로챔)
// main.jsx가 install, ParchmentAlertHost가 표시

const listeners = new Set()
const queue = []
let current = null

function emit() {
  listeners.forEach((fn) => fn())
}

export function subscribeParchmentAlert(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getParchmentAlertMessage() {
  return current
}

export function showParchmentAlert(message) {
  queue.push(String(message ?? ""))
  if (current === null) {
    current = queue.shift() ?? null
    emit()
  }
}

export function dismissParchmentAlert() {
  current = queue.length > 0 ? queue.shift() : null
  emit()
}

export function installParchmentAlert() {
  if (typeof window === "undefined") return
  window.alert = (message) => {
    showParchmentAlert(message)
  }
}
