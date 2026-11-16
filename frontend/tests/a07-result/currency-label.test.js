// 판 보상 뒤 재화 시험: 상점 재화 내역 사유 이름 "판 보상", 경제 다시 읽기 신호면 잔액을 다시 받아 +1 보임, 프로필 신호만이면 잔액 안 다시 읽음
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-F-041·042·100 (화면 상태)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./resultKit.mjs"

// 로그인 화면 묶음 문지기를 불러 두면 계정 값 다시 읽기 창구에 프로필·재화·업적 스토어가 등록됨 (앱과 같은 길)
await import("../../src/shared/ui/ProtectedRoute.jsx")
const { historyReasonLabel } = await import("../../src/domains/store/utils/currencyView.js")
const { useEconomyStore } = await import("../../src/domains/economy/store/economy.store.js")
const { default: StoreCurrencyBalance } = await import("../../src/domains/store/components/StoreCurrencyBalance.jsx")

test.afterEach(() => {
  useEconomyStore.getState().reset()
  K.resetAll()
})

const ME = "a07a0000-0000-4000-8000-000000777001"
const WALLET = `/economy/accounts/${ME}/wallet`

// 상점 오른쪽 위 재화 칸 (경제 스토어 값 그대로)
function Balance() {
  const { balanceGold, balanceDiamond, status } = useEconomyStore()
  return K.h(StoreCurrencyBalance, { visible: true, balanceGold, balanceDiamond, status })
}

// 로그인 + 잔액 100골드로 상점 칸을 그림, 서버 지갑 답은 101골드 (판 보상 1 들어간 뒤)
async function openBalance() {
  const sock = K.installFakeSocket()
  K.signIn(ME, "나")
  const http = K.installFakeFetch({
    [`GET ${WALLET}`]: { status: 200, body: { balanceGold: 101, balanceDiamond: 7 } },
    [`GET /economy/accounts/${ME}/entitlements`]: { status: 200, body: { entitlements: [], loadout: {} } },
  })
  useEconomyStore.setState({ balanceGold: 100, balanceDiamond: 7, status: "ready" })
  await K.renderAt("/lobby", K.h(Balance))
  return { sock, http }
}
const goldText = () => document.querySelector('[aria-label^="무료 재화"]')?.getAttribute("aria-label") ?? ""
const walletCalls = (http) => http.calls.filter((c) => c.method === "GET" && c.path === WALLET).length

test("A07-F-041 상점 재화 내역 사유 이름: 장부 사유 GAME_REWARD → \"판 보상\"", () => {
  assert.equal(historyReasonLabel("GAME_REWARD"), "판 보상")
  // 모르는 사유는 "기타" (늘 "판 보상"이 아님)
  assert.equal(historyReasonLabel("SOMETHING_ELSE"), "기타")
})

test("A07-F-042 경제 다시 읽기 신호면 잔액 다시 읽음: account_cache_invalidated { scopes:['economy','achievements'] } → 잔액 요청 1번, 잔액 +1 보임", async () => {
  const { sock, http } = await openBalance()
  assert.equal(goldText(), "무료 재화 100")
  await sock.serverSays("account_cache_invalidated", { scopes: ["economy", "achievements"] })
  await K.waitUntil(() => goldText() === "무료 재화 101", { label: "잔액 101" })
  assert.equal(walletCalls(http), 1)
  assert.equal(goldText(), "무료 재화 101")
})

test("A07-F-100 경제 신호 없이 프로필 신호만이면 잔액 안 다시 읽음: { scopes:['profile'] } → 잔액 요청 0번", async () => {
  const { sock, http } = await openBalance()
  await sock.serverSays("account_cache_invalidated", { scopes: ["profile"] })
  await K.flush(20)
  assert.equal(walletCalls(http), 0)
  assert.equal(goldText(), "무료 재화 100")
})
