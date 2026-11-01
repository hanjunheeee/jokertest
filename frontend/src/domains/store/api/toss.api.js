// 토스 결제 SDK 불러오기와 테스트 결제창 열기
// currency/topup.js(충전 시작)가 씀
import { CLIENT_KEY, SDK_URL } from "../constants/currencyPurchase.js"

// 불러오는 중인 SDK 보관, 스크립트를 한 번만 붙이기 위함
let sdkLoading = null
// 이미 있으면 바로 씀, 불러오는 중이면 그걸 같이 기다림
const loadTossSdk = () => {
  if (typeof window.TossPayments === "function") return Promise.resolve(window.TossPayments)
  if (!sdkLoading) {
    sdkLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      // 실패하면 스크립트 떼고 비움 (다음에 다시 붙이기 위함)
      const fail = () => {
        sdkLoading = null
        script.remove()
        reject(Object.assign(new Error("SDK_LOAD_FAILED"), { code: "SDK_LOAD_FAILED" }))
      }
      script.src = SDK_URL
      script.async = true
      // 불러왔는데 TossPayments가 없어도 실패로 봄
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
