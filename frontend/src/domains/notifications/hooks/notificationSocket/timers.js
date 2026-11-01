// ready 응답 기다림 타이머 (시험용 갈아끼우기 포함)
// ready 동기화(readySync.js)가 씀, 시험용 함수는 알림 소켓 훅이 다시 내보냄
let override = null

// 시험에서 가짜 타이머 넣기, null이면 진짜로 되돌림
export function __setNotificationTimersForTests(next) {
  override = next ?? null
}

// 타이머 걸기, 시험용 가짜가 있으면 그걸 씀
export const schedule = (fn, ms) => (override?.setTimeout ?? globalThis.setTimeout)(fn, ms)

// 걸린 타이머가 없으면 아무것도 안 함
export const unschedule = (id) => {
  if (id === null || id === undefined) return
  ;(override?.clearTimeout ?? globalThis.clearTimeout)(id)
}
