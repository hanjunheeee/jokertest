// 결제창 멈춤 감시 (카드사 화면에서 X로 닫으면 SDK 약속이 안 끝나는 경우 풀기)
// currency/topup.js가 결제창 열 때 SDK 약속과 겨루게 씀

// 취소로 보는 SDK 오류 코드 (v2 USER_CANCEL, 예전 이름 PAY_PROCESS_CANCELED·ABORTED)
export const CANCEL_CODES = Object.freeze(["USER_CANCEL", "PAY_PROCESS_CANCELED", "PAY_PROCESS_ABORTED"])
export const isCancelCode = (code) => CANCEL_CODES.includes(code)

// 창 닫힘으로 보는 시각들: 연 뒤 이만큼 지나야 돌아옴으로 봄·돌아온 뒤 다시 보는 틈·끝까지 기다리는 시간
export const PAYMENT_WATCH = Object.freeze({ graceMs: 1500, settleMs: 800, timeoutMs: 10 * 60 * 1000 })

// 닫힘 오류 하나 만들기 (topup.js가 취소로 안내)
const closedError = (why) => Object.assign(new Error("PAYMENT_WINDOW_CLOSED"), { code: "PAYMENT_WINDOW_CLOSED", why })

// 결제창이 아직 이 페이지 안 틀(iframe)에 떠 있는지: 초점이 틀 안이면 아직 결제 중으로 봄
const insidePaymentFrame = (doc) => doc.activeElement?.tagName === "IFRAME"

// 페이지로 돌아옴(보임·초점)·오래 기다림이면 닫힘 오류로 끝나는 약속, stop()으로 감시 끔
export function watchPaymentWindow({ win = window, doc = document, now = () => Date.now(), timing = PAYMENT_WATCH } = {}) {
  const openedAt = now()
  let settleTimer = null
  let timeoutTimer = null
  let finished = false
  let rejectWatch = () => {}

  const stop = () => {
    finished = true
    clearTimeout(settleTimer)
    clearTimeout(timeoutTimer)
    win.removeEventListener("focus", onBack)
    doc.removeEventListener("visibilitychange", onBack)
  }
  const close = (why) => {
    if (finished) return
    stop()
    rejectWatch(closedError(why))
  }
  // 돌아옴: 연 직후 흔들림은 빼고, 잠깐 뒤에도 보이고 틀 밖이면 닫힘
  function onBack() {
    if (finished || doc.visibilityState === "hidden" || now() - openedAt < timing.graceMs) return
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      if (doc.visibilityState !== "hidden" && !insidePaymentFrame(doc)) close("returned")
    }, timing.settleMs)
  }

  const promise = new Promise((_, reject) => { rejectWatch = reject })
  win.addEventListener("focus", onBack)
  doc.addEventListener("visibilitychange", onBack)
  timeoutTimer = setTimeout(() => close("timeout"), timing.timeoutMs)
  return { promise, stop }
}
