import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

// InvitedGuestsSpread.jsx/InvitedGuestsMasteryRanking.jsx는 JSX 문법을 그대로 쓰는 .jsx라
// 이 저장소의 node:test 실행(변환기 없음)으로는 마운트할 수 없다 —
// InGameParchmentModalWiring.test.js와 같은 이유로, 그 두 파일은 소스 배선을 텍스트로
// 확인한다. mergeInvitedGuestsSpreads.js/pages.js는 JSX가 없는 순수 .js라 실제로 실행해
// 검증한다 — 더미 대체 제거(AC-06)와 랭킹 전체 목록 보존(AC-03/A-10)의 핵심 로직이 여기 있다.

const { mergeInvitedGuestsSpreads } = await import("../../../content/invitedGuests/mergeInvitedGuestsSpreads.js")
const { getInvitedGuestsPage, INVITED_GUESTS_PAGES } = await import("../../../content/invitedGuests/pages.js")
const { INVITED_GUESTS_JOB_SPREAD_META } = await import("../../../content/invitedGuests/jobSpreadMeta.js")
const { INVITED_GUESTS_JOB_CATALOG } = await import("../../../content/invitedGuests/jobCatalog.js")
const { INVITED_GUESTS_JOB_CHALLENGES } = await import("../../../content/invitedGuests/jobChallenges.js")

const bigRanking = (n) => Array.from({ length: n }, (_, i) => ({
  rank: i + 1, uuid: `u${i}`, nickname: `닉${i}`, profile_image_url: null, games: 10 + i, wins: i, winRate: i / (10 + i),
}))

// ── AC-06: 다른 직업 데이터로 대체하는 noble 폴백이 완전히 제거됐다 ──────────────

test("mergeInvitedGuestsSpreads: clown 상태가 비어 있어도 noble(귀족) 데이터로 대체되지 않는다", () => {
  const jobState = {
    byJobKey: {
      noble: { status: "success", myStats: { games: 50, wins: 40, survivalCount: 20, winRate: 0.8 }, ranking: bigRanking(3), error: null },
      // clown은 아예 요청 전(idle) — 기본값으로 채워진다.
    },
  }

  const pages = mergeInvitedGuestsSpreads(INVITED_GUESTS_JOB_SPREAD_META, INVITED_GUESTS_JOB_CATALOG, INVITED_GUESTS_JOB_CHALLENGES, jobState)
  const clownPage = pages.find((p) => p.jobKey === "clown")

  assert.equal(clownPage.left.myStats, null, "clown의 내 전적이 noble 값으로 채워지면 안 된다")
  assert.equal(clownPage.right.ranking, null, "clown의 랭킹이 noble 값으로 채워지면 안 된다")
  assert.equal(clownPage.left.statsStatus, "idle")
})

test("mergeInvitedGuestsSpreads: 0판(games:0)인 내 전적은 다른 직업 값으로 대체되지 않고 0 그대로 나간다", () => {
  const jobState = {
    byJobKey: {
      guard: { status: "success", myStats: { games: 0, wins: 0, survivalCount: 0, winRate: 0 }, ranking: [], error: null },
    },
  }
  const pages = mergeInvitedGuestsSpreads(INVITED_GUESTS_JOB_SPREAD_META, INVITED_GUESTS_JOB_CATALOG, INVITED_GUESTS_JOB_CHALLENGES, jobState)
  const guardPage = pages.find((p) => p.jobKey === "guard")

  assert.deepEqual(guardPage.left.myStats, { playCount: 0, winRate: "0%", survivalCount: 0 })
  assert.deepEqual(guardPage.right.ranking, [])
})

// ── AC-03/A-10: 랭킹은 상위 5명으로 잘리지 않고 전체가 그대로 전달된다 ───────────

test("mergeInvitedGuestsSpreads: 서버가 돌려준 랭킹 전체가 잘리지 않고 그대로 나간다(예전 5명 상한 없음)", () => {
  const jobState = {
    byJobKey: {
      witchHunter: { status: "success", myStats: { games: 12, wins: 6, survivalCount: 8, winRate: 0.5 }, ranking: bigRanking(23), error: null },
    },
  }
  const pages = mergeInvitedGuestsSpreads(INVITED_GUESTS_JOB_SPREAD_META, INVITED_GUESTS_JOB_CATALOG, INVITED_GUESTS_JOB_CHALLENGES, jobState)
  const page = pages.find((p) => p.jobKey === "witchHunter")

  assert.equal(page.right.ranking.length, 23, "랭킹이 5명으로 잘리면 안 된다(AC-03/A-10)")
})

test("mergeInvitedGuestsSpreads: 랭킹 로딩 상태(status=loading)에서는 ranking이 null(아직 없음)이지 빈 배열이 아니다", () => {
  const jobState = { byJobKey: { doctor: { status: "loading", myStats: null, ranking: null, error: null } } }
  const pages = mergeInvitedGuestsSpreads(INVITED_GUESTS_JOB_SPREAD_META, INVITED_GUESTS_JOB_CATALOG, INVITED_GUESTS_JOB_CHALLENGES, jobState)
  const page = pages.find((p) => p.jobKey === "doctor")

  assert.equal(page.right.ranking, null, "로딩 중인지 진짜 0명인지 화면이 구분할 수 있어야 한다")
  assert.equal(page.right.rankingStatus, "loading")
})

test("mergeInvitedGuestsSpreads: 에러 상태의 메시지가 그대로 전달된다", () => {
  const jobState = { byJobKey: { guard: { status: "error", myStats: null, ranking: null, error: "네트워크 오류" } } }
  const pages = mergeInvitedGuestsSpreads(INVITED_GUESTS_JOB_SPREAD_META, INVITED_GUESTS_JOB_CATALOG, INVITED_GUESTS_JOB_CHALLENGES, jobState)
  const page = pages.find((p) => p.jobKey === "guard")

  assert.equal(page.left.statsStatus, "error")
  assert.equal(page.left.statsError, "네트워크 오류")
})

test("mergeInvitedGuestsSpreads: jobState 없이 불러도(=INVITED_GUESTS_PAGES) 정적 소개는 살아있고 전적은 idle이다", () => {
  assert.equal(INVITED_GUESTS_PAGES.length, INVITED_GUESTS_JOB_SPREAD_META.length)
  for (const page of INVITED_GUESTS_PAGES) {
    assert.equal(page.ready, true)
    assert.equal(page.left.myStats, null)
    assert.equal(page.right.ranking, null)
  }
})

// ── AC-06: pages.js가 더 이상 [DEV] 더미 상태를 import하지 않는다 ───────────────

test("pages.js는 더 이상 invitedGuestsDevState([DEV] 더미)를 import하지 않는다", async () => {
  const source = await readFile(new URL("../../../content/invitedGuests/pages.js", import.meta.url), "utf8")
  assert.equal(/^import .*invitedGuestsDevState/m.test(source), false)
})

test("getInvitedGuestsPage(pageIndex, jobState)로 특정 직업의 런타임 상태를 조회할 수 있다", () => {
  const jobState = { byJobKey: { noble: { status: "success", myStats: { games: 5, wins: 1, survivalCount: 2, winRate: 0.2 }, ranking: [], error: null } } }
  const page = getInvitedGuestsPage(0, jobState)
  assert.equal(page.jobKey, "noble")
  assert.equal(page.left.myStats.playCount, 5)
})

// ── AC-03/AC-06: InvitedGuestsSpread.jsx/InvitedGuestsMasteryRanking.jsx 소스 배선 ──
// (JSX 파일이라 렌더할 수 없다 — 실제 마운트 검증은 K0145/X0566 anchor 파일의 소스에서
// 요청·재시도·페이지 이동이 실제로 연결돼 있는지를 텍스트로 확인한다.)

test("InvitedGuestsSpread.jsx: roleStatistics.store를 구독해 선택한 직업을 요청하고, 재시도 버튼이 retryJob을 부른다", async () => {
  const source = await readFile(new URL("../InvitedGuestsSpread.jsx", import.meta.url), "utf8")

  assert.equal(source.includes("useRoleStatisticsStore"), true)
  assert.equal(source.includes("requestJob"), true)
  assert.equal(source.includes("retryJob"), true)
  // getInvitedGuestsPage가 실제로 jobState를 넘겨 받는지(더 이상 인자 없이 부르지 않는지).
  assert.equal(/getInvitedGuestsPage\(jobIndex,\s*\{\s*byJobKey\s*\}\)/.test(source), true)
})

test("InvitedGuestsMasteryRanking.jsx: 전달받은 ranking 전체 길이를 기준으로 화면 내 페이지를 넘긴다", async () => {
  const source = await readFile(new URL("../right/InvitedGuestsMasteryRanking.jsx", import.meta.url), "utf8")

  assert.equal(source.includes("useState"), true, "현재 페이지 상태가 있어야 한다")
  assert.equal(source.includes("pageCount"), true)
  assert.equal(source.includes("ranking.length"), true, "잘리지 않은 전체 길이를 기준으로 페이지 수를 계산해야 한다")
})

test('new accounts without a portrait use the granted gold-mask asset instead of crashing PublicAsset', () => {
  const ranking = bigRanking(2)
  ranking[1].profile_image_url = ''
  const pages = mergeInvitedGuestsSpreads(INVITED_GUESTS_JOB_SPREAD_META, INVITED_GUESTS_JOB_CATALOG, INVITED_GUESTS_JOB_CHALLENGES, {
    byJobKey: {noble:{status:'success',myStats:null,ranking,error:null}}
  })
  for (const row of pages.find(p => p.jobKey === 'noble').right.ranking) {
    assert.equal(row.profileSrc, '/shopItem/player-profile/프로필-금빛가면.png')
    assert.ok(row.profileSrc.startsWith('/'))
  }
})
