// 알림 API 부르기 (시험용 갈아끼우기 포함)
// 알림 스토어 액션이 씀, API 파일은 처음 부를 때 늦게 불러옴
let override = null

// 시험에서 가짜 API 넣기, null이면 진짜로 되돌림
export function __setNotificationsApiForTests(next) {
  override = next ?? null
}

// 이름으로 API 함수 부름, 가짜에 그 함수가 있으면 가짜 사용
export async function callNotificationsApi(name, ...args) {
  if (override !== null && typeof override[name] === "function") {
    return override[name](...args)
  }
  const module = await import("../../api/notifications.api.js")
  return module[name](...args)
}
