// 토스 결제 SDK 불러오기와 테스트 결제창 열기
// 충전 시작 흐름이 씀
// 테스트 키 검사는 원래 currencyPurchase.store.js 내용 그대로 옮김 (바꾸지 않음)
import { CLIENT_KEY, SDK_URL } from "../constants/currencyPurchase.js"

// SDK 스크립트는 한 번만 붙이고, 실패하면 다음에 다시 붙일 수 있게 비움
let sdkLoading = null
const loadTossSdk = () => {
  if (typeof window.TossPayments === "function") return Promise.resolve(window.TossPayments)
  if (!sdkLoading) {
    sdkLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      const fail = () => {
        sdkLoading = null
        script.remove()
        reject(Object.assign(new Error("SDK_LOAD_FAILED"), { code: "SDK_LOAD_FAILED" }))
      }
      script.src = SDK_URL
      script.async = true
      script.onload = () => (typeof window.TossPayments === "function" ? resolve(window.TossPayments) : fail())
      script.onerror = fail
      document.head.appendChild(script)
    })
  }
  return sdkLoading
}

// 테스트 키(test_ck_)일 때만 결제창을 엶, 결과는 /store?topup=success|fail 로 돌아옴
export async function requestTossTestPayment({ clientKey, orderId, amount, orderName }, origin) {
  if (!CLIENT_KEY.test(clientKey ?? "")) throw Object.assign(new Error("CONFIG_MISSING"), { code: "CONFIG_MISSING" })
  const TossPayments = await loadTossSdk()
  const payment = TossPayments(clientKey).payment({ customerKey: crypto.randomUUID() })
  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: amount },
    orderId,
    orderName,
    successUrl: `${origin}/store?topup=success`,
    failUrl: `${origin}/store?topup=fail`,
  })
}
