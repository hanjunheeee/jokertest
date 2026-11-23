// 앱 확인 창 (기본: window.confirm, 모바일은 양피지 확인 창으로 바꿀 수 있음)
let handler = null

export function setAppConfirmHandler(fn) {
  handler = typeof fn === "function" ? fn : null
}

export async function appConfirm(message) {
  if (handler) {
    return handler(message)
  }
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return window.confirm(message)
  }
  return false
}