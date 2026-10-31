import assert from "node:assert/strict"
import test from "node:test"

const {
  INVITE_SFX_DIAGNOSTICS_LIMIT,
  INVITE_SFX_QA_FLAG,
  __setInviteSfxDiagnosticsEnvForTests,
  getInviteSfxDiagnosticsAccount,
  getInviteSfxObservations,
  isInviteSfxDiagnosticsEnabled,
  recordInviteSfxObservation,
  resetInviteSfxDiagnostics,
  subscribeInviteSfxObservations,
  summarizeInviteSfxObservations,
  syncInviteSfxDiagnosticsAccount,
  trackInviteSfxCompletion,
} = await import("../../../../src/domains/lobby/diagnostics/inviteSfxDiagnostics.js")

const QUERY = `?${INVITE_SFX_QA_FLAG}=1`

function useEnv(dev, search) {
  __setInviteSfxDiagnosticsEnvForTests(() => ({ dev, search }))
}

function resetAll() {
  __setInviteSfxDiagnosticsEnvForTests(null)
  resetInviteSfxDiagnostics()
}

test.beforeEach(resetAll)
test.afterEach(resetAll)

test("AC-07: 실제 번들 기본값(개발 플래그 없음)에서는 꺼져 있다", () => {
  assert.equal(isInviteSfxDiagnosticsEnabled(), false)
})

test("AC-07: production 번들이면 QA 표식이 있어도 켜지지 않는다", () => {
  useEnv(false, QUERY)
  assert.equal(
    isInviteSfxDiagnosticsEnabled(), false,
    "배포 빌드에서 URL만으로 진단이 열리면 사용자 화면에 내부 식별자가 노출된다",
  )
  assert.equal(recordInviteSfxObservation(() => ({ phase: "received" })), null)
  assert.deepEqual(getInviteSfxObservations(), [])
})

test("AC-07: 개발 번들이어도 QA 표식이 없으면 켜지지 않고 기록을 만들지 않는다", () => {
  useEnv(true, "?other=1")
  assert.equal(isInviteSfxDiagnosticsEnabled(), false)

  let built = 0
  recordInviteSfxObservation(() => { built += 1; return { phase: "received" } })
  assert.equal(built, 0, "꺼져 있으면 기록할 값을 만들지도 않아야 한다(명시적 opt-in)")
  assert.deepEqual(getInviteSfxObservations(), [])
})

test("AC-07: 개발 번들 + QA 표식일 때만 켜진다", () => {
  useEnv(true, QUERY)
  assert.equal(isInviteSfxDiagnosticsEnabled(), true)
  useEnv(true, `?${INVITE_SFX_QA_FLAG}=true&x=1`)
  assert.equal(isInviteSfxDiagnosticsEnabled(), true)
  useEnv(true, `?${INVITE_SFX_QA_FLAG}=0`)
  assert.equal(isInviteSfxDiagnosticsEnabled(), false)
})

test("AC-07: 계정이 바뀌면 이전 계정의 관찰을 통째로 버린다", () => {
  useEnv(true, QUERY)
  syncInviteSfxDiagnosticsAccount("account-a")
  recordInviteSfxObservation(() => ({
    phase: "received", accountId: "account-a", inviteId: "invite-1", eligible: true,
  }))
  assert.equal(getInviteSfxObservations().length, 1)

  syncInviteSfxDiagnosticsAccount("account-b")
  assert.deepEqual(
    getInviteSfxObservations(), [],
    "이전 계정의 초대 식별자가 다음 계정 화면에 남으면 안 된다",
  )
  assert.equal(getInviteSfxDiagnosticsAccount(), "account-b")

  syncInviteSfxDiagnosticsAccount(null)
  assert.equal(getInviteSfxDiagnosticsAccount(), null)
  assert.deepEqual(getInviteSfxObservations(), [])
})

test("AC-07: 현재 계정 밖의 관찰은 사실만 남기고 식별자를 담지 않는다", () => {
  useEnv(true, QUERY)
  syncInviteSfxDiagnosticsAccount("account-a")
  recordInviteSfxObservation(() => ({
    phase: "received", accountId: "account-b", inviteId: "secret-invite",
    eventId: "game-invite:secret-invite:received", eligible: false, reason: "account-mismatch",
  }))

  const [entry] = getInviteSfxObservations()
  assert.equal(entry.foreignAccount, true)
  assert.equal(entry.inviteId, null, "다른 계정의 초대 id를 화면에 적으면 계정 경계가 새어 나간다")
  assert.equal(entry.eventId, null)
  assert.equal(entry.reason, "account-mismatch", "사실 자체는 남아야 증거가 된다")
})

test("AC-07: 적격 판정과 실제 청음을 합산하지 않는다", async () => {
  useEnv(true, QUERY)
  syncInviteSfxDiagnosticsAccount("account-a")

  const unreviewed = recordInviteSfxObservation(() => ({
    phase: "received", accountId: "account-a", inviteId: "invite-1", eligible: true,
    dispatchStatus: "suppressed", dispatchReason: "asset-unreviewed",
  }))
  trackInviteSfxCompletion(unreviewed, Promise.resolve("stopped"))

  const played = recordInviteSfxObservation(() => ({
    phase: "received", accountId: "account-a", inviteId: "invite-2", eligible: true,
    dispatchStatus: "accepted", dispatchReason: null,
  }))
  trackInviteSfxCompletion(played, Promise.resolve("played"))
  await Promise.resolve()
  await Promise.resolve()

  const summary = summarizeInviteSfxObservations()
  assert.equal(summary.eligibleDispatches, 2)
  assert.equal(
    summary.audiblePlaybacks, 1,
    "억제된 재생 시도를 청음으로 세면 미검토 자산을 들었다고 주장하게 된다",
  )
  assert.equal(summary.suppressedByReason["asset-unreviewed"], 1)
})

test("AC-07: 무음 사유별 집계가 그대로 보존된다", () => {
  useEnv(true, QUERY)
  syncInviteSfxDiagnosticsAccount("account-a")
  for (const reason of ["at-or-below-cursor", "already-consumed", "at-or-below-cursor"]) {
    recordInviteSfxObservation(() => ({
      phase: "received", accountId: "account-a", inviteId: "x", eligible: false, reason,
    }))
  }
  const summary = summarizeInviteSfxObservations()
  assert.equal(summary.arrivals, 3)
  assert.equal(summary.eligibleDispatches, 0)
  assert.equal(summary.audiblePlaybacks, 0)
  assert.deepEqual(summary.suppressedByReason, { "at-or-below-cursor": 2, "already-consumed": 1 })
})

test("AC-07: 기록이 던져도 호출자에게 전파되지 않는다", () => {
  useEnv(true, QUERY)
  syncInviteSfxDiagnosticsAccount("account-a")
  assert.doesNotThrow(() => {
    const seq = recordInviteSfxObservation(() => { throw new Error("diagnostics broke") })
    assert.equal(seq, null)
  })
  assert.deepEqual(getInviteSfxObservations(), [])

  subscribeInviteSfxObservations(() => { throw new Error("listener broke") })
  assert.doesNotThrow(() => {
    recordInviteSfxObservation(() => ({ phase: "received", accountId: "account-a", eligible: true }))
  })
  assert.equal(getInviteSfxObservations().length, 1)
})

test("AC-07: 기록은 상한을 넘지 않고 같은 값이면 같은 참조를 돌려준다", () => {
  useEnv(true, QUERY)
  syncInviteSfxDiagnosticsAccount("account-a")
  for (let i = 0; i < INVITE_SFX_DIAGNOSTICS_LIMIT + 25; i += 1) {
    recordInviteSfxObservation(() => ({
      phase: "received", accountId: "account-a", inviteId: `invite-${i}`, eligible: false, reason: "x",
    }))
  }
  const observations = getInviteSfxObservations()
  assert.equal(observations.length, INVITE_SFX_DIAGNOSTICS_LIMIT, "기록이 무한히 자라면 안 된다")
  assert.equal(
    observations[observations.length - 1].inviteId,
    `invite-${INVITE_SFX_DIAGNOSTICS_LIMIT + 24}`,
    "가장 최근 관찰이 남아야 한다",
  )
  assert.equal(
    getInviteSfxObservations(), observations,
    "바뀌지 않았는데 새 배열을 만들면 화면이 끝없이 다시 그려진다",
  )
})
