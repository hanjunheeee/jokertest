// 가게 구매 흐름 컨트롤러 (일반 아이템 묶음 구매·골드 구매, 결과 모름이면 같은 id로 다시 확인)
// storePurchase.store.js가 저장소·요청 함수를 넣어 만들어 씀
import { createStore } from "zustand/vanilla"
import { goldRejectedStatus, idle, rejectedCodes } from "../constants/purchaseController.js"
import { isGoldResultMissing, restore, unresolved, validText, validVersion } from "../utils/purchaseRecord.js"

// 저장소·요청 함수는 밖에서 받음 (시험에서 가짜로 바꿔 끼우기 위함)
export function createPurchaseController({ storage, post, postGold, lookup, refresh, randomId }) {
  let account = null
  let generation = 0
  let busy = false
  const store = createStore(() => ({ ...idle }))
  // 구매 기록은 계정마다 기기에 따로 저장함
  const key = (id) => `joker:store-purchase:v1:${id}`
  // 지금 계정 칸에 기록 저장 (저장소가 막히면 던짐)
  const save = (state) => storage().setItem(key(account), JSON.stringify(state))
  // 기록부터 저장하고 화면 상태 바꿈, 저장 실패면 던져서 부른 쪽이 보내기를 멈춤
  const update = (state) => { save(state); store.setState(state, true) }
  // 계정이 바뀌면 그 계정의 기록을 되살림, 기록이 깨졌으면 구매를 막음
  const activate = (id) => {
    if (account === id) return
    // 세대 올림, 앞 계정 요청의 늦은 결과는 current()에서 버림
    account = id
    generation += 1
    busy = false
    let state = { ...idle }
    if (id) {
      try {
        const raw = storage().getItem(key(id))
        if (raw) {
          state = restore(JSON.parse(raw))
        }
      } catch {
        state = { ...idle, status: "blocked", error: "이전 구매 기록을 읽지 못했습니다. 저장소를 사용할 수 있는지 확인한 후 다시 로그인해 주세요." }
      }
    }
    store.setState(state, true)
  }
  // 일반 아이템 구매, 결과 모름이면 먼저 같은 id로 결과를 물어보고 없을 때만 다시 보냄
  const run = async (itemIds, checkOnly = false) => {
    // 로그인 안 함·처리 중·기록 막힘·가격 바뀜 안내 중이면 무시
    if (!account || busy || store.getState().status === "blocked" || store.getState().status === "priceChanged") return
    // 결과 모름이 남았으면 그 상품 그대로 이어서, 확인만 누른 거면 남은 게 있을 때만
    const previous = store.getState()
    const recovering = unresolved(previous.status)
    if (checkOnly && !recovering) return
    const ids = recovering ? [...previous.itemIds] : [...itemIds]
    if (!ids.length) return
    // 이어서면 같은 id, 새 구매면 새 id (서버가 같은 구매를 두 번 처리하지 않게 함)
    const request = { referenceEventId: recovering ? previous.referenceEventId : `shop:${randomId()}`, itemIds: ids, status: "pending", error: null }
    const started = generation
    // 그사이 계정이 바뀌었는지 (바뀌었으면 결과 버림)
    const current = () => started === generation
    busy = true
    // 기록을 저장 못 하면 보내지 않고 앞 상태로 돌림
    try { update(request) } catch {
      busy = false
      store.setState({ ...previous, error: "구매 기록을 안전하게 저장하지 못해 전송하지 않았습니다." }, true)
      return
    }
    try {
      // 이어서면 먼저 결과 물어봄, 이미 됐으면 확인 처리하고 끝
      if (recovering) {
        try {
          await lookup(request.referenceEventId)
          if (!current()) return
          update({ ...request, status: "confirmed" })
          await refresh().catch(() => {})
          return
        } catch (error) {
          if (!current()) return
          // 결과 없음일 때만 아래에서 다시 보냄, 확인만이거나 다른 오류면 결과 모름
          if (checkOnly || error.code !== "PURCHASE_RESULT_NOT_FOUND") {
            update({ ...request, status: "unknown", error: "아직 구매 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요." })
            return
          }
        }
      }
      // 구매 보내고 성공이면 확인 처리, 잔액 다시 받기 실패는 무시
      await post({ items: ids.map(itemId => ({ itemId })), referenceEventId: request.referenceEventId })
      if (!current()) return
      update({ ...request, status: "confirmed" })
      await refresh().catch(() => {})
    } catch (error) {
      if (!current()) return
      // 서버가 거절한 코드면 거절, 나머지는 결과 모름 (저장도 실패하면 화면만 결과 모름)
      const state = { ...request, status: rejectedCodes.has(error.code) ? "rejected" : "unknown", error: error.message ?? "구매 결과를 확인하지 못했습니다." }
      try { update(state) } catch { store.setState({ ...request, status: "unknown", error: "구매 결과 저장에 실패했습니다. 결과 확인을 눌러 주세요." }, true) }
    } finally {
      // 계정이 바뀌었으면 새 계정 쪽 처리 중 표시는 건드리지 않음
      if (current()) busy = false
    }
  }
  // 골드 구매 (purchase: 새로 사기, check: 결과 확인만, retry: 같은 id로 다시)
  const runGold = async (mode, product) => {
    // 로그인 안 함·처리 중·기록 막힘·가격 바뀜 안내 중이면 무시
    if (!account || busy) return
    const previous = store.getState()
    if (previous.status === "blocked" || previous.status === "priceChanged") return
    // 새로 사기는 결과 모름이 없을 때만, 확인·다시는 앞 골드 구매가 남았을 때만
    const priorGold = previous.kind === "GOLD"
    const recovering = unresolved(previous.status)
    if (mode === "purchase" && recovering) return
    if (mode === "check" && !(priorGold && recovering)) return
    if (mode === "retry" && !(priorGold && (recovering || previous.status === "rejected"))) return
    // 새로 사기는 받은 상품, 나머지는 앞 기록의 상품·버전 씀, 모양 틀리면 무시
    const { productId, version } = (mode === "purchase" ? product : previous) ?? {}
    if (!validText(productId, 64) || !validVersion(version)) return
    // 이어서면 같은 id, 새로 사기·거절 뒤 다시는 새 id
    const request = {
      kind: "GOLD", referenceEventId: recovering && mode !== "purchase" ? previous.referenceEventId : `shop:${randomId()}`,
      itemIds: [], productId, version, status: "pending", error: null, code: null,
    }
    const started = generation
    // 그사이 계정이 바뀌었는지 (바뀌었으면 결과 버림)
    const current = () => started === generation
    busy = true
    // 기록을 저장 못 하면 보내지 않고 앞 상태로 돌림
    try { update(request) } catch {
      busy = false
      store.setState({ ...previous, error: "구매 기록을 안전하게 저장하지 못해 전송하지 않았습니다." }, true)
      return
    }
    try {
      // 이어서면 먼저 결과 물어봄, 결과 없음일 때만 아래에서 다시 보냄
      let result
      if (recovering) {
        try { result = await lookup(request.referenceEventId, "GOLD") } catch (error) {
          if (!current()) return
          if (mode === "check" || !isGoldResultMissing(error)) {
            update({ ...request, status: "unknown", error: "아직 구매 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요." })
            return
          }
        }
      }
      // 물어본 결과가 없으면 새로 보냄, 성공이면 확인 처리 뒤 잔액 갱신
      result ??= await postGold({ productId, version, referenceEventId: request.referenceEventId })
      if (!current()) return
      const confirmed = { ...request, status: "confirmed" }
      try { update(confirmed) } catch { store.setState(confirmed, true) }
      try { await refresh(result) } catch { /* 잔액 갱신 실패는 구매 결과와 상관없어 무시함 */ }
    } catch (error) {
      if (!current()) return
      // 가격 바뀜·거절은 코드와 HTTP 상태가 둘 다 맞을 때만, 나머지는 결과 모름
      let state
      if (error.code === "PRODUCT_VERSION_MISMATCH" && error.ok === false && error.status === 409) {
        state = { ...request, status: "priceChanged", error: "상품 정보가 변경되었습니다. 새 조건을 확인해 주세요." }
      } else if (Object.hasOwn(goldRejectedStatus, error.code) && error.ok === false && error.status === goldRejectedStatus[error.code]) {
        state = { ...request, status: "rejected", code: error.code, error: error.message ?? "구매가 거부되었습니다." }
      } else {
        state = { ...request, status: "unknown", error: "구매 결과를 확인하지 못했습니다." }
      }
      try { update(state) } catch { store.setState(state, true) }
    } finally {
      // 계정이 바뀌었으면 새 계정 쪽 처리 중 표시는 건드리지 않음
      if (current()) busy = false
    }
  }
  // 가격 바뀜 안내를 확인하면 빈 상태로 돌림
  const acceptPriceChange = () => {
    if (busy || store.getState().status !== "priceChanged") return
    try { update({ ...idle }) } catch {
      store.setState({ ...store.getState(), error: "확인 상태를 저장하지 못했습니다. 다시 시도해 주세요." }, true)
    }
  }
  // 남은 기록이 골드 구매인지 (확인·다시 버튼이 어느 흐름을 탈지 정함)
  const isGold = () => store.getState().kind === "GOLD"
  // prepare: 일괄구매 창 열 때 끝난 결과만 지움 (결과 모름·막힘·가격 바뀜은 남김)
  return {
    store, activate, acceptPriceChange,
    prepare: () => { const { status } = store.getState(); if (!unresolved(status) && status !== "blocked" && status !== "priceChanged") store.setState({ ...idle }, true) },
    purchase: (ids) => run(ids), purchaseGold: (product) => runGold("purchase", product),
    check: () => isGold() ? runGold("check") : run([], true),
    retry: () => isGold() ? runGold("retry") : run(store.getState().itemIds),
  }
}
