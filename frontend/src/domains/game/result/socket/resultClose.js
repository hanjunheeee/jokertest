// 결과 화면 닫힘: 서버가 판 끝 180초 뒤 결과 화면을 닫는 사건 받기·닫힘 시각 읽기·남은 초 세기
// hooks/useGameResultReturnToMatching의 결과 화면 닫힘 훅이 씀
import { readResultClosesAtField } from "../../ingame/utils/normalizePublicWinResult.js"

// 결과 화면 머무는 최대 초 (서버 180초와 같음, 기기 시계가 앞서도 이보다 크게 안 보이게)
export const RESULT_CLOSE_SECONDS = 180

// 서버가 결과 화면을 닫았다는 사건 받기 ({ gameId, reason: 'RESULT_TIMEOUT' }), 끊는 함수 돌려줌
export function onResultClosed(socket, handler) {
  socket.on("game_result_closed", handler)
  return () => socket.off("game_result_closed", handler)
}

// 닫힘 시각 읽기: 판 상태·스냅샷 답 맨 위의 ms 시각, 없거나 틀리면 null
// 판 상태엔 판 끝 방송을 받을 때 담김, 새로고침 뒤엔 스냅샷 답에서 읽음
// 예: { resultClosesAt: 1763290000000 } → 1763290000000, { winResult: { winner: "JOKER" } } → null
export function readResultClosesAt(source) {
  if (source === null || typeof source !== "object") return null
  return readResultClosesAtField(source)
}

// 남은 초: 닫힘 시각까지 올림한 초, 0 아래·최대 초 위는 자름, 시각 없으면 null
// 예: (닫힘 - 지금) 179.2초 → 180, 0.4초 → 1, 지남 → 0
export function computeResultSecondsLeft(closesAt, now) {
  if (!Number.isFinite(closesAt) || closesAt <= 0 || !Number.isFinite(now)) return null
  const seconds = Math.ceil((closesAt - now) / 1000)
  return Math.min(RESULT_CLOSE_SECONDS, Math.max(0, seconds))
}
