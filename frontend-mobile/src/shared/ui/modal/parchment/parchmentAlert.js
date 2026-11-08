// 전역 alert → 양피지 안내 창 (데스크톱 로직의 alert 호출을 모바일에서 가로챔)
// main.jsx가 install, ParchmentAlertHost가 표시

// 안 닫은 안내를 탭 저장소에 남김: alert 바로 뒤 location.replace 해도(다른 기기 로그인 끊김) 새 화면에서 다시 띄우기
const PENDING_KEY = "mmc:parchment-alert-pending"

const listeners = new Set()
const queue = []
let current = null

function savePending() {
  try {
    const pending = current === null ? [] : [current, ...queue]
    if (pending.length > 0) globalThis.sessionStorage?.setItem(PENDING_KEY, JSON.stringify(pending))
    else globalThis.sessionStorage?.removeItem(PENDING_KEY)
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 보임
  }
}

function loadPending() {
  try {
    const list = JSON.parse(globalThis.sessionStorage?.getItem(PENDING_KEY) ?? "[]")
    return Array.isArray(list) ? list.map((message) => String(message ?? "")) : []
  } catch {
    return []
  }
}

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
  if (current === null) current = queue.shift() ?? null
  savePending()
  emit()
}

export function dismissParchmentAlert() {
  current = queue.length > 0 ? queue.shift() : null
  savePending()
  emit()
}

export function installParchmentAlert() {
  if (typeof window === "undefined") return
  // 새로 읽기 전에 못 닫은 안내부터 다시 띄움
  loadPending().forEach((message) => queue.push(message))
  if (current === null && queue.length > 0) {
    current = queue.shift()
    emit()
  }
  window.alert = (message) => {
    showParchmentAlert(message)
  }
}
