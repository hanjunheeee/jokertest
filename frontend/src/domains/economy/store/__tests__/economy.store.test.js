import assert from "node:assert/strict"
import test, { mock } from "node:test"

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
let currentUser = { uuid: "user-1" }
const authListeners = new Set()

const setCurrentUser = (nextUser) => {
  const prevUser = currentUser
  currentUser = nextUser
  for (const listener of authListeners) listener({ user: currentUser }, { user: prevUser })
}

mock.module("../../../../shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: (...args) => postImpl(...args),
    },
  },
})

mock.module("../../../auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: currentUser }),
      subscribe: (listener) => { authListeners.add(listener); return () => authListeners.delete(listener) },
    },
  },
})

const { useEconomyStore } = await import("../economy.store.js")

const createDeferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function resetStore() {
  getImpl = async () => { throw new Error("api.get stub not set") }
  postImpl = async () => { throw new Error("api.post stub not set") }
  currentUser = { uuid: "user-1" }
  useEconomyStore.getState().reset()
}

test("fetchSummary는 지갑·소유품·장착 상태를 저장한다", async () => {
  resetStore()
  getImpl = async (endpoint) => {
    if (endpoint === "/economy/accounts/user-1/wallet") return { balanceGold: 300, balanceDiamond: 5 }
    if (endpoint === "/economy/accounts/user-1/entitlements") {
      return { entitlements: [{ itemId: "player-profile-금빛가면" }], loadout: { selectedProfilePhotoId: "player-profile-금빛가면" } }
    }
    throw new Error(`unexpected endpoint: ${endpoint}`)
  }

  await useEconomyStore.getState().fetchSummary()

  const state = useEconomyStore.getState()
  assert.equal(state.status, "ready")
  assert.equal(state.balanceGold, 300)
  assert.equal(state.balanceDiamond, 5)
  assert.equal(state.entitlements.length, 1)
  assert.equal(state.loadout.selectedProfilePhotoId, "player-profile-금빛가면")
})

test("로그인하지 않은 상태에서 fetchSummary는 요청 없이 에러 상태가 된다", async () => {
  resetStore()
  currentUser = null
  let called = false
  getImpl = async () => { called = true; return {} }

  await useEconomyStore.getState().fetchSummary()

  assert.equal(called, false)
  assert.equal(useEconomyStore.getState().status, "error")
})

test("fetchSummary 실패 시 status가 error가 되고 이전 값은 유지되지 않는다(재시도 가능)", async () => {
  resetStore()
  getImpl = async () => { throw new Error("네트워크 오류") }

  await useEconomyStore.getState().fetchSummary()

  const state = useEconomyStore.getState()
  assert.equal(state.status, "error")
  assert.equal(state.error, "네트워크 오류")
})

test("retry는 fetchSummary를 다시 실행한다", async () => {
  resetStore()
  let calls = 0
  getImpl = async (endpoint) => {
    calls += 1
    if (endpoint.endsWith("/wallet")) return { balanceGold: 10, balanceDiamond: 0 }
    return { entitlements: [], loadout: {} }
  }

  await useEconomyStore.getState().retry()

  assert.equal(calls, 2)
  assert.equal(useEconomyStore.getState().status, "ready")
})

test("purchase는 매번 새 referenceEventId를 발급하고, 성공하면 요약을 다시 불러온다", async () => {
  resetStore()
  const seenReferenceIds = []
  postImpl = async (endpoint, body) => {
    assert.equal(endpoint, "/economy/purchase")
    seenReferenceIds.push(body.referenceEventId)
    return { idempotent: false, ledgerEntry: { id: 1 } }
  }
  let summaryFetchCount = 0
  getImpl = async (endpoint) => {
    summaryFetchCount += 1
    if (endpoint.endsWith("/wallet")) return { balanceGold: 0, balanceDiamond: 0 }
    return { entitlements: [], loadout: {} }
  }

  await useEconomyStore.getState().purchase({ itemId: "profile-border-남작" })

  assert.equal(seenReferenceIds.length, 1)
  assert.equal(summaryFetchCount, 2)
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "confirmed")
})

test("응답을 잃어버린(전송 불확실) 구매를 재시도하면 같은 참조 사건 ID를 재사용한다", async () => {
  resetStore()
  let shouldFail = true
  const seenReferenceIds = []
  postImpl = async (endpoint, body) => {
    seenReferenceIds.push(body.referenceEventId)
    if (shouldFail) throw new Error("네트워크 끊김")
    return { idempotent: true, ledgerEntry: { id: 1 } }
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 0, balanceDiamond: 0 } : { entitlements: [], loadout: {} })

  await assert.rejects(() => useEconomyStore.getState().purchase({ itemId: "profile-border-남작" }))
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "unknown")

  shouldFail = false
  await useEconomyStore.getState().retryPurchase("profile-border-남작")

  assert.equal(seenReferenceIds.length, 2)
  assert.equal(seenReferenceIds[0], seenReferenceIds[1], "전송 불확실 재시도는 같은 참조 사건 ID를 재사용해야 한다")
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "confirmed")
})

test("equip은 서버가 돌려준 loadout으로 상태를 갱신한다", async () => {
  resetStore()
  useEconomyStore.setState((state) => ({ loadout: { ...state.loadout, revision: "rev-known" } }))
  postImpl = async (endpoint, body) => {
    assert.equal(endpoint, "/economy/equip")
    assert.deepEqual(body, { slot: "PROFILE_BORDER", itemId: "profile-border-남작", expectedRevision: "rev-known" })
    return { loadout: { selectedProfileBorderId: "profile-border-남작" } }
  }

  await useEconomyStore.getState().equip({ slot: "PROFILE_BORDER", itemId: "profile-border-남작" })

  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
})

test("F-14 AC-01(R-IMPL2): revision을 아직 모르면 equip은 버전 없이 전송하지 않고 authoritative GET으로 먼저 읽은 뒤 그 revision으로 전송한다", async () => {
  resetStore()
  let getCalls = 0
  let seenBody
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return { balanceGold: 0, balanceDiamond: 0 }
    getCalls += 1
    return { entitlements: [], loadout: { selectedSkinsByJob: {}, revision: "server-rev-initial" } }
  }
  postImpl = async (_, body) => { seenBody = body; return { loadout: {} } }

  await useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛" })

  assert.equal(getCalls, 1, "revision을 모르면 authoritative GET을 정확히 한 번 먼저 시도해야 한다")
  assert.equal(seenBody.expectedRevision, "server-rev-initial", "방금 읽은 authoritative revision으로 전송해야 한다")
})

test("F-14 AC-01(R-IMPL2): revision을 모르는 채 authoritative GET마저 실패하면 POST를 시도하지 않고 LOADOUT_REVISION_UNAVAILABLE로 거부한다", async () => {
  resetStore()
  let postCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return { balanceGold: 0, balanceDiamond: 0 }
    throw new Error("네트워크 오류(authoritative GET 실패)")
  }
  postImpl = async () => { postCalls += 1; return { loadout: {} } }

  await assert.rejects(
    () => useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛" }),
    { code: "LOADOUT_REVISION_UNAVAILABLE" },
  )

  assert.equal(postCalls, 0, "revision을 확인하지 못하면 서버로 어떤 POST도 전송하면 안 된다(버전 없는 커밋 금지)")
})

test("F-14 AC-01(P1): equip()은 현재 loadout.revision을 expectedRevision으로 함께 보낸다", async () => {
  resetStore()
  useEconomyStore.setState({ loadout: { ...useEconomyStore.getState().loadout, revision: "rev-known" } })
  let seenBody
  postImpl = async (_, body) => { seenBody = body; return { loadout: {} } }

  await useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛" })

  assert.equal(seenBody.expectedRevision, "rev-known")
})

test("F-14 AC-01(P1): 서버 CAS 충돌(409 SKIN_REVISION_CONFLICT) 후 authoritative GET이 요청한 스킨과 이미 같은 값을 보여주면 재전송 없이 그 서버 진실을 받아들인다", async () => {
  resetStore()
  let postCalls = 0
  postImpl = async () => {
    postCalls++
    throw Object.assign(new Error("conflict"), { code: "SKIN_REVISION_CONFLICT" })
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedSkinsByJob: { guard: "player-skin-경비원1-바이올렛" }, revision: "server-rev-1" } })

  const result = await useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛" })

  assert.equal(postCalls, 1, "요청한 스킨이 이미 서버 값과 같으면 재전송하지 않아야 한다")
  assert.equal(result.reconciled, true)
  assert.equal(useEconomyStore.getState().loadout.selectedSkinsByJob.guard, "player-skin-경비원1-바이올렛")
  assert.equal(useEconomyStore.getState().loadout.revision, "server-rev-1")
})

test("F-14 AC-01(R-IMPL2, MUST CLOSE STALE CONFLICT REPLAY): 지연된 스킨 확정이 충돌하면 오래된 의도를 자동 재전송하지 않고, 서버 진실을 보존한 채 명확한 충돌 오류로 남는다", async () => {
  resetStore()
  let postCalls = 0
  postImpl = async () => {
    postCalls++
    throw Object.assign(new Error("conflict"), { code: "SKIN_REVISION_CONFLICT" })
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedSkinsByJob: { guard: "player-skin-경비원1-바이올렛", noble: "player-skin-귀족1-블러드" }, revision: "server-rev-1" } })

  await assert.rejects(
    () => useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원2-푸른서리" }),
    { code: "SKIN_REVISION_CONFLICT" },
  )

  assert.equal(postCalls, 1, "스킨/카드 충돌은 오래된 의도를 새 revision으로 자동 재전송하면 안 된다(재시도 POST 없음)")
  const { selectedSkinsByJob, revision } = useEconomyStore.getState().loadout
  assert.equal(selectedSkinsByJob.guard, "player-skin-경비원1-바이올렛", "재전송 없이 서버가 실제로 커밋한 최신 값을 그대로 보존해야 한다(요청한 오래된 값으로 되돌리지 않음)")
  assert.equal(selectedSkinsByJob.noble, "player-skin-귀족1-블러드")
  assert.equal(revision, "server-rev-1")
})

test("F-14 AC-01(R-IMPL2): 스킨 장착 요청이 전송되기 전에 계정이 바뀌면 오래된 요청은 취소되고 서버로 전송되지 않는다", async () => {
  resetStore()
  useEconomyStore.setState((state) => ({ loadout: { ...state.loadout, revision: "rev-known" } }))
  const gate = createDeferred(); let calls = 0
  postImpl = async () => { calls++; await gate.promise; return { loadout: { selectedSkinsByJob: { guard: "player-skin-경비원1-바이올렛" } } } }

  const a = useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛" })
  const b = useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원2-푸른서리" })
  const rejected = assert.rejects(b, { code: "SESSION_CHANGED" })
  setCurrentUser({ uuid: "user-2" })
  gate.resolve(); await a; await rejected

  assert.equal(calls, 1, "계정 전환 뒤 대기 중이던 오래된 요청은 서버로 전송되면 안 된다")
  assert.equal(useEconomyStore.getState().loadout.selectedSkinsByJob, null, "새 계정 화면에 이전 계정 요청의 결과가 남으면 안 된다")
})

test("F-14 AC-01(P1): equip()과 equipProfile()은 같은 직렬 큐를 공유한다 — 뒤이은 프로필 확정은 앞선 스킨 장착이 실제로 끝난 뒤에만 전송된다", async () => {
  resetStore()
  useEconomyStore.setState((state) => ({ loadout: { ...state.loadout, revision: "rev-known" } }))
  const gate = createDeferred()
  const calls = []
  postImpl = async (endpoint, body) => {
    calls.push(endpoint)
    if (calls.length === 1) await gate.promise
    if (endpoint === "/economy/equip") return { loadout: {} }
    return { loadout: { selectedProfileBorderId: body.borderItemId } }
  }

  const a = useEconomyStore.getState().equip({ slot: "JOB_SKIN_GUARD", itemId: "player-skin-경비원1-바이올렛" })
  const b = useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" })
  assert.deepEqual(calls, ["/economy/equip"], "같은 큐를 공유하므로 A(스킨)가 실제로 서버에 전송될 때까지 B(프로필)는 전송되면 안 된다")
  gate.resolve()
  await Promise.all([a, b])
  assert.deepEqual(calls, ["/economy/equip", "/economy/equip-profile"])
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
})

test("equipProfile은 바뀐 슬롯만 실어 POST /economy/equip-profile을 호출하고 서버가 돌려준 loadout으로 상태를 갱신한다", async () => {
  resetStore()
  postImpl = async (endpoint, body) => {
    assert.equal(endpoint, "/economy/equip-profile")
    assert.equal(body.photoItemId, "player-profile-기사")
    assert.equal(body.borderItemId, undefined, "넘기지 않은 슬롯은 요청 본문에 값이 있으면 안 된다")
    return { loadout: { selectedProfilePhotoId: "player-profile-기사", selectedProfileBorderId: "profile-border-평민" } }
  }

  await useEconomyStore.getState().equipProfile({ photoItemId: "player-profile-기사" })

  const { loadout } = useEconomyStore.getState()
  assert.equal(loadout.selectedProfilePhotoId, "player-profile-기사")
  assert.equal(loadout.selectedProfileBorderId, "profile-border-평민")
})

test("equipProfile이 실패하면 이전 loadout을 그대로 두고 예외를 던진다", async () => {
  resetStore()
  useEconomyStore.setState({ loadout: { selectedProfilePhotoId: "player-profile-금빛가면", selectedProfileBorderId: "profile-border-평민", selectedCardFrameId: null } })
  postImpl = async () => {
    const error = new Error("보유하지 않은 상품은 장착할 수 없습니다.")
    error.code = "ITEM_NOT_OWNED"
    throw error
  }

  await assert.rejects(
    () => useEconomyStore.getState().equipProfile({ photoItemId: "player-profile-기사", borderItemId: "profile-border-황제" }),
    (error) => error.code === "ITEM_NOT_OWNED",
  )

  const { loadout } = useEconomyStore.getState()
  assert.equal(loadout.selectedProfilePhotoId, "player-profile-금빛가면")
  assert.equal(loadout.selectedProfileBorderId, "profile-border-평민")
})

test("equipProfile 응답이 도착하기 전에 계정이 바뀌면(requestGeneration 변경) 늦게 도착한 결과가 새 계정 상태를 덮어쓰지 않는다", async () => {
  resetStore()
  let resolvePost
  postImpl = () => new Promise((resolve) => { resolvePost = resolve })

  const equipPromise = useEconomyStore.getState().equipProfile({ photoItemId: "player-profile-기사" })
  useEconomyStore.getState().reset()

  resolvePost({ loadout: { selectedProfilePhotoId: "player-profile-기사" } })
  await equipPromise

  assert.equal(useEconomyStore.getState().loadout.selectedProfilePhotoId, null, "이전 계정 요청의 늦은 성공이 리셋된 상태를 덮어쓰면 안 된다")
})

test("profile writes serialize actual commits: B cannot reach server before A settles", async () => {
  resetStore()
  const gate = createDeferred()
  const calls = []
  let persisted = null
  postImpl = async (_, body) => {
    calls.push(body.borderItemId)
    if (calls.length === 1) await gate.promise
    persisted = body.borderItemId
    return { loadout: { selectedProfileBorderId: persisted } }
  }
  const a = useEconomyStore.getState().equipProfile({ borderItemId: "A" })
  const b = useEconomyStore.getState().equipProfile({ borderItemId: "B" })
  assert.deepEqual(calls, ["A"])
  gate.resolve()
  await Promise.all([a, b])
  assert.deepEqual(calls, ["A", "B"])
  assert.equal(persisted, "B")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, persisted)
})

test("rejected latest profile keeps the preceding committed server value", async () => {
  resetStore()
  const gate = createDeferred()
  postImpl = async (_, body) => {
    if (body.borderItemId === "A") { await gate.promise; return { loadout: { selectedProfileBorderId: "A" } } }
    throw Object.assign(new Error("not owned"), { code: "ITEM_NOT_OWNED" })
  }
  const a = useEconomyStore.getState().equipProfile({ borderItemId: "A" })
  const b = useEconomyStore.getState().equipProfile({ borderItemId: "B" })
  const rejected = assert.rejects(b, { code: "ITEM_NOT_OWNED" })
  gate.resolve(); await a; await rejected
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "A")
})

test("unknown outcome does not permanently block queued writes — each write independently attempts and surfaces its own explicit error", async () => {
  resetStore()
  const gate = createDeferred(); let calls = 0
  postImpl = async () => { calls++; await gate.promise; throw new TypeError("connection lost") }
  const a = useEconomyStore.getState().equipProfile({ borderItemId: "A" })
  const b = useEconomyStore.getState().equipProfile({ borderItemId: "B" })
  const failures = Promise.all([assert.rejects(a, /connection lost/), assert.rejects(b, /connection lost/)])
  gate.resolve()
  await failures
  assert.equal(calls, 2, "B는 A의 결과를 확인할 수 없는 상태에서도 영구 차단되지 않고 스스로 서버에 확정을 시도해야 한다")
})

test("F-13 AC-02(A-09): 서버 CAS 충돌(409) 후 authoritative GET이 요청한 슬롯과 이미 같은 값을 보여주면 재전송 없이 그 서버 진실을 받아들인다", async () => {
  resetStore()
  let postCalls = 0
  postImpl = async () => {
    postCalls++
    throw Object.assign(new Error("conflict"), { code: "PROFILE_REVISION_CONFLICT" })
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 10, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfileBorderId: "profile-border-남작", revision: "server-rev-1" } })

  const result = await useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" })

  assert.equal(postCalls, 1, "요청한 슬롯이 이미 서버 값과 같으면 재전송하지 않아야 한다")
  assert.equal(result.reconciled, true)
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
  assert.equal(useEconomyStore.getState().loadout.revision, "server-rev-1", "재조정 GET이 읽은 최신 revision이 store에 반영되어야 한다")
})

test("F-13 AC-02(A-09): 서버 CAS 충돌(409) 후 authoritative GET이 다른 값을 보여주면 최신 revision으로 같은 의도를 재전송해 성공한다", async () => {
  resetStore()
  let postCalls = 0
  const seenRevisions = []
  postImpl = async (_, body) => {
    postCalls++
    seenRevisions.push(body.expectedRevision)
    if (postCalls === 1) throw Object.assign(new Error("conflict"), { code: "PROFILE_REVISION_CONFLICT" })
    return { loadout: { selectedProfileBorderId: "profile-border-남작", revision: "server-rev-2" } }
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 10, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfileBorderId: "profile-border-다른값", revision: "server-rev-1" } })

  const result = await useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" })

  assert.equal(postCalls, 2, "충돌 후 서버 값이 다르면 최신 revision으로 정확히 한 번 재전송해야 한다")
  assert.equal(seenRevisions[1], "server-rev-1", "재전송은 재조정 GET이 읽은 최신 revision을 실어야 한다")
  assert.equal(result.loadout.selectedProfileBorderId, "profile-border-남작")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")
})

test("F-13 AC-02(A-09): 충돌 재조정이 반복 실패하면 최대 재시도(2회) 뒤 명확한 오류로 끝나고 초안·재시도 경로가 남는다(무한 재시도 금지)", async () => {
  resetStore()
  let postCalls = 0
  postImpl = async () => {
    postCalls++
    throw Object.assign(new Error("conflict"), { code: "PROFILE_REVISION_CONFLICT" })
  }
  let getCalls = 0
  getImpl = async (endpoint) => {
    if (endpoint.endsWith("/wallet")) return { balanceGold: 10, balanceDiamond: 0 }
    getCalls++
    return { entitlements: [], loadout: { selectedProfileBorderId: "profile-border-다른값", revision: `server-rev-${getCalls}` } }
  }

  await assert.rejects(
    () => useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" }),
    { code: "PROFILE_REVISION_CONFLICT" },
  )

  assert.equal(postCalls, 3, "최초 POST 1회 + 자동 재시도 최대 2회 = 총 3회를 넘겨 보내면 안 된다")
})

test("F-13 AC-02(A-09): 소유권 거부(ITEM_NOT_OWNED)처럼 명시적 거부는 재조정 GET 없이 즉시 던진다", async () => {
  resetStore()
  let getCalls = 0
  postImpl = async () => { throw Object.assign(new Error("not owned"), { code: "ITEM_NOT_OWNED" }) }
  getImpl = async () => { getCalls++; throw new Error("should not be called") }

  await assert.rejects(
    () => useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-황제" }),
    { code: "ITEM_NOT_OWNED" },
  )

  assert.equal(getCalls, 0, "명시적 거부는 authoritative GET을 시도하지 않아야 한다(불필요한 재조정 없음)")
})

test("F-13 AC-02(A-09, A-11 계약 보존): 전송 불확실(code 없음)은 store가 스스로 재조정하지 않고 즉시 다시 던진다 — 재조정·재시도는 호출부(useProfileBorderEditor.js)의 몫이다", async () => {
  resetStore()
  let postCalls = 0
  let getCalls = 0
  postImpl = async () => { postCalls++; throw new TypeError("네트워크 오류") }
  getImpl = async () => { getCalls++; throw new Error("should not be called") }

  await assert.rejects(
    () => useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-귀족" }),
    /네트워크 오류/,
  )

  assert.equal(postCalls, 1, "전송 불확실은 store 안에서 자동으로 다시 보내면 안 된다(한 번만 전송)")
  assert.equal(getCalls, 0, "전송 불확실의 재조정은 store가 아니라 호출부의 몫이다 — store는 GET을 시도하지 않아야 한다")
})

test("account switch cancels queued old-account write before transport", async () => {
  resetStore()
  const gate = createDeferred(); let calls = 0
  postImpl = async () => { calls++; await gate.promise; return { loadout: { selectedProfileBorderId: "A" } } }
  const a = useEconomyStore.getState().equipProfile({ borderItemId: "A" })
  const b = useEconomyStore.getState().equipProfile({ borderItemId: "B" })
  const rejected = assert.rejects(b, { code: "SESSION_CHANGED" })
  setCurrentUser({ uuid: "user-2" })
  gate.resolve(); await a; await rejected
  assert.equal(calls, 1)
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, null)
})

test("F-13 AC-02(CODEX-5): equipProfile 시도가 시작되기 전부터 진행 중이던 fetchSummary(재조회)가 그 시도보다 늦게 도착해도, 이미 확정된 최신 loadout을 덮어쓰지 않는다", async () => {
  resetStore()
  const pendingRefreshResolvers = []
  getImpl = (endpoint) => new Promise((resolve) => {
    pendingRefreshResolvers.push(() => resolve(endpoint.endsWith("/wallet")
      ? { balanceGold: 777, balanceDiamond: 42 }
      : {
        entitlements: [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }],
        loadout: { selectedProfileBorderId: "profile-border-평민" },
      }))
  })
  const refreshPromise = useEconomyStore.getState().fetchSummary()

  postImpl = async () => ({ loadout: { selectedProfileBorderId: "profile-border-남작" } })
  await useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" })
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")

  assert.equal(pendingRefreshResolvers.length, 2, "fetchSummary는 wallet·entitlements 두 endpoint를 함께 불러야 한다")
  pendingRefreshResolvers.forEach((resolve) => resolve())
  await refreshPromise
  assert.equal(useEconomyStore.getState().status, "ready", "suppressed old loadout must not leave summary loading")
  assert.equal(useEconomyStore.getState().balanceGold, 777, "지갑은 loadout 보류와 무관하게 실제 조회값으로 정착해야 한다")
  assert.equal(useEconomyStore.getState().balanceDiamond, 42)
  assert.deepEqual(
    useEconomyStore.getState().entitlements,
    [{ itemId: "profile-border-평민", itemType: "PROFILE_BORDER" }],
    "소유품도 loadout 보류와 무관하게 실제 조회값(비어있지 않은 값)으로 정착해야 한다",
  )

  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "더 먼저 시작된 재조회가 뒤늦게 도착해 더 최신 확정 시도(equipProfile)의 결과를 덮어쓰면 안 된다",
  )
})

test("F-13 AC-03(CODEX-6): 실제 purchase가 유발한 fetchSummary가 아직 끝나지 않은 동안 더 최신 equipProfile이 먼저 확정돼도, purchase가 끝나면 방금 구매한 항목이 실제로 entitlements에 반영되고 loading 상태가 남지 않는다", async () => {
  resetStore()
  let resolvePurchasePost
  postImpl = async (endpoint, body) => {
    if (endpoint === "/economy/purchase") {
      assert.equal(body.itemId, "profile-border-백작")
      return new Promise((resolve) => { resolvePurchasePost = () => resolve({ idempotent: false, ledgerEntry: { id: 1 } }) })
    }
    if (endpoint === "/economy/equip-profile") {
      return { loadout: { selectedProfileBorderId: "profile-border-남작" } }
    }
    throw new Error(`unexpected post ${endpoint}`)
  }

  const pendingRefreshResolvers = []
  getImpl = (endpoint) => new Promise((resolve) => {
    pendingRefreshResolvers.push(() => resolve(endpoint.endsWith("/wallet")
      ? { balanceGold: 850, balanceDiamond: 12 }
      : {
        entitlements: [
          { itemId: "profile-border-평민", itemType: "PROFILE_BORDER" },
          { itemId: "profile-border-백작", itemType: "PROFILE_BORDER" },
        ],
        loadout: { selectedProfileBorderId: "profile-border-평민" },
      }))
  })

  const purchasePromise = useEconomyStore.getState().purchase({ itemId: "profile-border-백작" })
  resolvePurchasePost()
  for (let i = 0; i < 10 && pendingRefreshResolvers.length < 2; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(pendingRefreshResolvers.length, 2, "purchase 성공 직후 실제 fetchSummary(wallet·entitlements)가 시작되어야 한다")
  assert.equal(useEconomyStore.getState().status, "loading")

  await useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" })
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-남작")

  pendingRefreshResolvers.forEach((resolve) => resolve())
  await purchasePromise

  assert.equal(useEconomyStore.getState().status, "ready", "purchase가 유발한 fetchSummary가 겹쳐도 loading에 멈춰 남으면 안 된다")
  assert.equal(useEconomyStore.getState().balanceGold, 850)
  assert.equal(useEconomyStore.getState().balanceDiamond, 12)
  assert.deepEqual(
    useEconomyStore.getState().entitlements.map((e) => e.itemId).sort(),
    ["profile-border-백작", "profile-border-평민"].sort(),
    "방금 구매한 항목이 entitlements에서 폐기되지 않고 실제로 반영되어야 한다(즉시 표시 요구, AC-03)",
  )
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-남작",
    "purchase가 유발한(더 오래된) fetchSummary의 loadout이 더 최신 equipProfile의 결과를 덮어쓰면 안 된다",
  )
})

test("F-13(CODEX-9): 획득 전에 시작된 fetchSummary가 획득 후 시작된 fetchSummary보다 늦게 성공 응답을 받아도, 새 조회가 반영한 신선한 소유품·잔액을 덮어쓰지 않는다", async () => {
  resetStore()
  const resolvers = []
  getImpl = (endpoint) => new Promise((resolve) => { resolvers.push({ endpoint, resolve }) })

  const oldFetch = useEconomyStore.getState().fetchSummary()
  const newFetch = useEconomyStore.getState().fetchSummary()
  assert.equal(resolvers.length, 4, "두 fetchSummary가 각각 wallet·entitlements 두 endpoint를 불러야 한다")

  resolvers.slice(2).forEach(({ endpoint, resolve }) => resolve(endpoint.endsWith("/wallet")
    ? { balanceGold: 500, balanceDiamond: 9 }
    : { entitlements: [{ itemId: "profile-border-백작", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-백작" } }))
  await newFetch
  assert.equal(useEconomyStore.getState().balanceGold, 500)

  resolvers.slice(0, 2).forEach(({ endpoint, resolve }) => resolve(endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfileBorderId: null } }))
  await oldFetch

  assert.equal(useEconomyStore.getState().status, "ready", "오래된 조회의 뒤늦은 성공이 ready 상태를 되돌리면 안 된다")
  assert.equal(useEconomyStore.getState().balanceGold, 500, "새 조회의 신선한 잔액이 오래된 조회로 덮어써지면 안 된다")
  assert.deepEqual(
    useEconomyStore.getState().entitlements,
    [{ itemId: "profile-border-백작", itemType: "PROFILE_BORDER" }],
    "방금 획득한 소유품이 오래된 조회로 다시 사라지면 안 된다",
  )
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-백작")
})

test("F-13(CODEX-9): 획득 전에 시작된 fetchSummary가 획득 후 시작된 fetchSummary보다 늦게 실패해도, 이미 확정된 신선한 상태와 ready를 되돌리지 않는다", async () => {
  resetStore()
  const resolvers = []
  getImpl = (endpoint) => new Promise((resolve, reject) => { resolvers.push({ endpoint, resolve, reject }) })

  const oldFetch = useEconomyStore.getState().fetchSummary()
  const newFetch = useEconomyStore.getState().fetchSummary()
  assert.equal(resolvers.length, 4)

  resolvers.slice(2).forEach(({ endpoint, resolve }) => resolve(endpoint.endsWith("/wallet")
    ? { balanceGold: 300, balanceDiamond: 1 }
    : { entitlements: [{ itemId: "profile-border-백작", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-백작" } }))
  await newFetch

  resolvers.slice(0, 2).forEach(({ reject }) => reject(new Error("오래된 조회의 지연된 네트워크 오류")))
  await oldFetch

  assert.equal(useEconomyStore.getState().status, "ready", "오래된 조회의 뒤늦은 실패가 이미 확정된 ready 상태를 error로 되돌리면 안 된다")
  assert.equal(useEconomyStore.getState().balanceGold, 300)
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-백작")
})

test("F-13(CODEX-9): equipProfile이 시작된 뒤에 시작된 fetchSummary가 equip 성공보다 늦게 equip 이전의 오래된 loadout으로 응답해도, 이미 저장된 사진·테두리를 덮어쓰지 않는다", async () => {
  resetStore()
  let resolveEquipPost
  postImpl = () => new Promise((resolve) => { resolveEquipPost = resolve })

  const equipPromise = useEconomyStore.getState().equipProfile({ photoItemId: "player-profile-기사", borderItemId: "profile-border-백작" })

  const getResolvers = []
  getImpl = (endpoint) => new Promise((resolve) => { getResolvers.push({ endpoint, resolve }) })
  const fetchPromise = useEconomyStore.getState().fetchSummary()
  assert.equal(getResolvers.length, 2)

  resolveEquipPost({ loadout: { selectedProfilePhotoId: "player-profile-기사", selectedProfileBorderId: "profile-border-백작" } })
  await equipPromise
  assert.equal(useEconomyStore.getState().loadout.selectedProfilePhotoId, "player-profile-기사")
  assert.equal(useEconomyStore.getState().loadout.selectedProfileBorderId, "profile-border-백작")

  getResolvers.forEach(({ endpoint, resolve }) => resolve(endpoint.endsWith("/wallet")
    ? { balanceGold: 100, balanceDiamond: 2 }
    : { entitlements: [], loadout: { selectedProfilePhotoId: "player-profile-금빛가면", selectedProfileBorderId: "profile-border-평민" } }))
  await fetchPromise

  assert.equal(useEconomyStore.getState().status, "ready")
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfilePhotoId,
    "player-profile-기사",
    "equip보다 먼저 시작된 재조회의 오래된 사진 값이 이미 저장된 값을 덮어쓰면 안 된다",
  )
  assert.equal(
    useEconomyStore.getState().loadout.selectedProfileBorderId,
    "profile-border-백작",
    "equip보다 먼저 시작된 재조회의 오래된 테두리 값이 이미 저장된 값을 덮어쓰면 안 된다",
  )
})

test("F-13 AC-02(운영자 지시, 2026-09-11 22:12): equipProfile은 clientIntentAt(클라이언트 벽시계 시각) 대신 서버 CAS용 expectedRevision을 요청에 싣는다", async () => {
  resetStore()
  const seenBodies = []
  postImpl = async (endpoint, body) => {
    seenBodies.push(body)
    return { loadout: { selectedProfileBorderId: "profile-border-남작", revision: "server-rev-1" } }
  }

  await useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" })

  assert.equal(seenBodies.length, 1)
  assert.deepEqual(
    Object.keys(seenBodies[0]).sort(),
    ["borderItemId", "expectedRevision", "photoItemId"],
    "clientIntentAt 없이 photoItemId/borderItemId/expectedRevision만 실려야 한다",
  )
  assert.equal(seenBodies[0].expectedRevision, null, "revision을 아직 모르면(초기 상태) null을 그대로 보낸다")
})

test("F-13 AC-02(운영자 코드 리뷰, 2026-09-12): 충돌 재조정용 authoritative GET은 지갑·소유품을 전혀 쓰지 않으므로, 뒤늦게 도착해도 더 최신 purchase가 반영한 잔액·소유품을 덮어쓰지 않는다", async () => {
  resetStore()
  const getResolvers = []
  getImpl = (endpoint) => new Promise((resolve) => { getResolvers.push({ endpoint, resolve }) })

  let equipPostCalls = 0
  postImpl = async (endpoint) => {
    if (endpoint === "/economy/equip-profile") {
      equipPostCalls += 1
      throw Object.assign(new Error("conflict"), { code: "PROFILE_REVISION_CONFLICT" })
    }
    if (endpoint === "/economy/purchase") return { idempotent: false, ledgerEntry: { id: 1 } }
    throw new Error(`unexpected post ${endpoint}`)
  }

  const equipPromise = useEconomyStore.getState().equipProfile({ borderItemId: "profile-border-남작" })
  for (let i = 0; i < 10 && getResolvers.length < 1; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(getResolvers.length, 1, "충돌 재조정은 GET을 정확히 한 번만 보내야 한다")
  assert.ok(getResolvers[0].endpoint.endsWith("/entitlements"), "재조정 GET은 loadout이 담긴 entitlements endpoint만 불러야 한다(wallet은 부르지 않는다)")

  const purchasePromise = useEconomyStore.getState().purchase({ itemId: "profile-border-백작" })
  for (let i = 0; i < 10 && getResolvers.length < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.equal(getResolvers.length, 3, "purchase 성공 뒤 fetchSummary가 wallet·entitlements 두 endpoint를 추가로 불러야 한다")
  getResolvers.slice(1).forEach(({ endpoint, resolve }) => resolve(endpoint.endsWith("/wallet")
    ? { balanceGold: 500, balanceDiamond: 9 }
    : { entitlements: [{ itemId: "profile-border-백작", itemType: "PROFILE_BORDER" }], loadout: { selectedProfileBorderId: "profile-border-평민" } }))
  await purchasePromise
  assert.equal(useEconomyStore.getState().balanceGold, 500, "purchase가 먼저 반영한 신선한 잔액이어야 한다")

  getResolvers[0].resolve({ entitlements: [{ itemId: "stale-item" }], loadout: { selectedProfileBorderId: "profile-border-남작", revision: "server-rev-late" } })
  const result = await equipPromise

  assert.equal(equipPostCalls, 1, "요청한 슬롯이 이미 서버 값과 같으므로 재전송하지 않는다")
  assert.equal(result.reconciled, true)
  assert.equal(useEconomyStore.getState().balanceGold, 500, "충돌 재조정 GET의 지연된 응답이 최신 purchase 잔액을 덮어쓰면 안 된다")
  assert.deepEqual(
    useEconomyStore.getState().entitlements.map((e) => e.itemId),
    ["profile-border-백작"],
    "충돌 재조정 GET의 지연된 응답이 최신 purchase 소유품을 덮어쓰면 안 된다",
  )
})

test("서버가 code와 함께 명시적으로 거부하면(확정 거부) status는 rejected이고, 재시도는 새 참조 사건 ID를 쓴다", async () => {
  resetStore()
  const seenReferenceIds = []
  postImpl = async (endpoint, body) => {
    seenReferenceIds.push(body.referenceEventId)
    const error = new Error("잔액이 부족합니다.")
    error.code = "INSUFFICIENT_BALANCE"
    throw error
  }

  await assert.rejects(() => useEconomyStore.getState().purchase({ itemId: "profile-border-남작" }))
  const pending = useEconomyStore.getState().pendingPurchases["profile-border-남작"]
  assert.equal(pending.status, "rejected")
  assert.equal(pending.code, "INSUFFICIENT_BALANCE")

  await assert.rejects(() => useEconomyStore.getState().retryPurchase("profile-border-남작"))
  assert.equal(seenReferenceIds.length, 2)
  assert.notEqual(seenReferenceIds[0], seenReferenceIds[1], "확정 거부 이후의 재시도는 새로운 시도이므로 새 참조 사건 ID를 써야 한다")
})

test("code 없는 실패(전송 불확실)는 status가 unknown이고 code는 비어 있다", async () => {
  resetStore()
  postImpl = async () => { throw new TypeError("Failed to fetch") }

  await assert.rejects(() => useEconomyStore.getState().purchase({ itemId: "profile-border-남작" }))
  const pending = useEconomyStore.getState().pendingPurchases["profile-border-남작"]
  assert.equal(pending.status, "unknown")
  assert.equal(pending.code, null)
})

test("로그아웃(user → null)하면 잔액·소유품·진행 중이던 구매 상태가 모두 초기화된다", async () => {
  resetStore()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 999, balanceDiamond: 3 } : { entitlements: [{ itemId: "x" }], loadout: {} })
  await useEconomyStore.getState().fetchSummary()
  assert.equal(useEconomyStore.getState().balanceGold, 999)

  setCurrentUser(null)

  const state = useEconomyStore.getState()
  assert.equal(state.balanceGold, 0)
  assert.equal(state.balanceDiamond, 0)
  assert.equal(state.entitlements.length, 0)
  assert.equal(state.status, "idle")
})

test("다른 계정으로 전환하면 이전 계정의 상태가 남지 않는다", async () => {
  resetStore()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 500, balanceDiamond: 1 } : { entitlements: [], loadout: {} })
  await useEconomyStore.getState().fetchSummary()
  assert.equal(useEconomyStore.getState().balanceGold, 500)

  setCurrentUser({ uuid: "user-2" })

  assert.equal(useEconomyStore.getState().balanceGold, 0, "계정이 바뀌면 이전 계정의 잔액이 남아 있으면 안 된다")
  assert.equal(useEconomyStore.getState().status, "idle")
})

test("지연 응답(delayed response): fetchSummary가 끝나기 전에 계정이 바뀌면 늦게 도착한 응답이 새 계정 상태를 덮어쓰지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  getImpl = async (endpoint) => {
    await deferred.promise
    return endpoint.endsWith("/wallet") ? { balanceGold: 111, balanceDiamond: 0 } : { entitlements: [], loadout: {} }
  }

  const fetchPromise = useEconomyStore.getState().fetchSummary()
  assert.equal(useEconomyStore.getState().status, "loading")

  setCurrentUser({ uuid: "user-2" })
  assert.equal(useEconomyStore.getState().status, "idle", "전환 즉시 리셋되어야 한다")

  deferred.resolve()
  await fetchPromise

  const state = useEconomyStore.getState()
  assert.equal(state.balanceGold, 0, "user-1의 뒤늦은 응답이 user-2의 화면(초기화된 상태)을 덮어쓰면 안 된다")
  assert.equal(state.status, "idle", "폐기된 세대의 응답은 status마저 바꾸면 안 된다")
})

test("지연 응답: purchase가 끝나기 전에 계정이 바뀌면 늦게 도착한 결과가 새 계정의 pendingPurchases에 쓰이지 않는다", async () => {
  resetStore()
  const deferred = createDeferred()
  postImpl = async () => {
    await deferred.promise
    return { idempotent: false, ledgerEntry: { id: 1 } }
  }
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet") ? { balanceGold: 0, balanceDiamond: 0 } : { entitlements: [], loadout: {} })

  const purchasePromise = useEconomyStore.getState().purchase({ itemId: "profile-border-남작" })
  assert.equal(useEconomyStore.getState().pendingPurchases["profile-border-남작"].status, "pending")

  setCurrentUser({ uuid: "user-2" })
  assert.deepEqual(useEconomyStore.getState().pendingPurchases, {}, "계정 전환 즉시 이전 계정의 진행 중이던 구매 상태가 지워져야 한다")

  deferred.resolve()
  const result = await purchasePromise

  assert.equal(result.idempotent, false, "폐기된 세대라도 서버 호출 자체의 결과는 호출부에 그대로 반환된다")
  assert.deepEqual(useEconomyStore.getState().pendingPurchases, {}, "user-1의 뒤늦은 구매 완료가 user-2 화면에 흔적을 남기면 안 된다")
})
