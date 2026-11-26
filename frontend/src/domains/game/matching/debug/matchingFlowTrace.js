// VITE_DEBUG_MATCHING_FLOW=1일 때만 방 만들기·대기방·인게임 이동 흐름을 콘솔·서버에 남김
// useSocket·useMatchingPage·useRoomEvents·useRoomRequests·useRoomCheck·navigateToInGame이 씀
import { sendMatchingFlowTrace } from "../socket/room.js"

const PREFIX = "[MMC-FLOW]"

// 명시 환경값이 켜져 있을 때만 추적 실행 (평소 개발·시험 중 불필요한 소켓 이벤트 막기)
const isFlowTraceEnabled = () => import.meta.env?.VITE_DEBUG_MATCHING_FLOW === "1"

// 추적 단계·현재 경로·시각을 한 묶음 값으로 만듦
function payload(step, detail) {
  const path = typeof window !== "undefined" ? window.location.pathname : ""
  return { step, path, t: Date.now(), ...detail }
}

// 대기방 흐름 한 단계 기록 (환경값이 꺼져 있으면 아무것도 안 함)
export function traceMatchingFlow(step, detail = {}) {
  if (!isFlowTraceEnabled()) return
  const body = payload(step, detail)
  console.log(PREFIX, body.step, body)
  const socket = typeof window !== "undefined" ? window.__MMC_FLOW_SOCKET : null
  if (socket?.connected) {
    sendMatchingFlowTrace(socket, body)
  } else if (typeof window !== "undefined") {
    console.warn(PREFIX, "socket_unavailable_for_terminal", { step, connected: Boolean(socket?.connected) })
  }
}

// 추적용 소켓 참조 등록 (환경값이 켜져 있을 때만 저장)
export function registerMatchingFlowSocket(socket) {
  if (!isFlowTraceEnabled() || typeof window === "undefined") return
  window.__MMC_FLOW_SOCKET = socket
}