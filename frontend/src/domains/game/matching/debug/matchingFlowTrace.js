// 개발 시 방 만들기→대기방→목록 튕김 추적 (브라우저 콘솔 + 선택 시 백엔드에도)
// node 시험엔 import.meta.env가 없어 ?. 로 읽음 (없으면 기록 안 함)
import { sendMatchingFlowTrace } from "../socket/room.js"

const PREFIX = "[MMC-FLOW]"

function payload(step, detail) {
  const path = typeof window !== "undefined" ? window.location.pathname : ""
  return { step, path, t: Date.now(), ...detail }
}

export function traceMatchingFlow(step, detail = {}) {
  if (!import.meta.env?.DEV) return
  const body = payload(step, detail)
  console.log(PREFIX, body.step, body)
  const socket = typeof window !== "undefined" ? window.__MMC_FLOW_SOCKET : null
  if (socket?.connected) {
    sendMatchingFlowTrace(socket, body)
  } else if (typeof window !== "undefined") {
    console.warn(PREFIX, "socket_unavailable_for_terminal", { step, connected: Boolean(socket?.connected) })
  }
}

export function registerMatchingFlowSocket(socket) {
  if (!import.meta.env?.DEV || typeof window === "undefined") return
  window.__MMC_FLOW_SOCKET = socket
}