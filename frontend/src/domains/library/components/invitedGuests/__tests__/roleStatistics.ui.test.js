import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

let myRoleStatisticsHandler = async () => []
let roleRankingHandler = async () => ({ ranking: [] })
let achievementsHandler = async () => []
let requestedRoles = []

mock.module("../../../api/roleStatistics.api.js", {
  namedExports: {
    getMyRoleStatisticsApi: (...args) => myRoleStatisticsHandler(...args),
    getRoleRankingApi: (role, ...rest) => {
      requestedRoles.push(role)
      return roleRankingHandler(role, ...rest)
    },
  },
})
mock.module("../../../api/achievements.api.js", {
  namedExports: { getMyAchievementsApi: (...args) => achievementsHandler(...args) },
})

const { mergeInvitedGuestsSpreads } = await import("../../../content/invitedGuests/mergeInvitedGuestsSpreads.js")
const { getInvitedGuestsPage, INVITED_GUESTS_PAGES } = await import("../../../content/invitedGuests/pages.js")
const { INVITED_GUESTS_JOB_SPREAD_META } = await import("../../../content/invitedGuests/jobSpreadMeta.js")
const { INVITED_GUESTS_JOB_CATALOG } = await import("../../../content/invitedGuests/jobCatalog.js")
const { INVITED_GUESTS_JOB_CHALLENGES } = await import("../../../content/invitedGuests/jobChallenges.js")

const bigRanking = (n) => Array.from({ length: n }, (_, i) => ({
  rank: i + 1, uuid: `u${i}`, nickname: `닉${i}`, profile_image_url: null, games: 10 + i, wins: i, winRate: i / (10 + i),
}))

test("mergeInvitedGuestsSpreads: clown 상태가 비어 있어도 noble(귀족) 데이터로 대체되지 않는다", () => {
  const jobState = {
    byJobKey: {
      noble: { status: "success", myStats: { games: 50, wins: 40, survivalCount: 20, winRate: 0.8 }, ranking: bigRanking(3), error: null },
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

test("InvitedGuestsSpread.jsx: roleStatistics.store를 구독해 선택한 직업을 요청하고, 재시도 버튼이 retryJob을 부른다", async () => {
  const source = await readFile(new URL("../InvitedGuestsSpread.jsx", import.meta.url), "utf8")

  assert.equal(source.includes("useRoleStatisticsStore"), true)
  assert.equal(source.includes("requestJob"), true)
  assert.equal(source.includes("retryJob"), true)
  assert.equal(/getInvitedGuestsPage\(jobIndex,\s*\{\s*byJobKey\s*\}\)/.test(source), true)
})

test("InvitedGuestsMasteryRanking.jsx: 전달받은 ranking 전체 길이를 기준으로 화면 내 페이지를 넘긴다", async () => {
  const source = await readFile(new URL("../right/InvitedGuestsMasteryRanking.jsx", import.meta.url), "utf8")

  assert.equal(source.includes("useState"), true, "현재 페이지 상태가 있어야 한다")
  assert.equal(source.includes("pageCount"), true)
  assert.equal(source.includes("ranking.length"), true, "잘리지 않은 전체 길이를 기준으로 페이지 수를 계산해야 한다")
})

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { default: InvitedGuestsSpread } = await import("../InvitedGuestsSpread.jsx")
const { useRoleStatisticsStore } = await import("../../../store/roleStatistics.store.js")

function statRowText(container, label) {
  const labelCell = [...container.querySelectorAll("td")].find((td) => td.textContent === label)
  return labelCell ? labelCell.parentElement.textContent : null
}

async function mountSpread() {
  let view
  await act(async () => {
    view = render(React.createElement(InvitedGuestsSpread, null))
  })
  return view
}

test.beforeEach(() => {
  useRoleStatisticsStore.getState().reset()
  requestedRoles = []
  myRoleStatisticsHandler = async () => []
  roleRankingHandler = async () => ({ ranking: [] })
  achievementsHandler = async () => []
})

test.afterEach(() => cleanup())

test("F-18 AC-06: 초대받은 자들에 들어가면 선택한 직업의 전적을 실제로 조회해 판수·승률을 표시한다", async () => {
  let resolveStats
  myRoleStatisticsHandler = () =>
    new Promise((resolve) => {
      resolveStats = () => resolve([{ role: "CITIZEN", games: 10, wins: 6, survivalCount: 4, winRate: 0.6 }])
    })

  const view = await mountSpread()

  assert.ok(
    view.container.textContent.includes("전적을 불러오는 중입니다"),
    "조회 중에는 로딩 상태가 보여야 한다(더미로 채우지 않는다).",
  )
  assert.deepEqual(requestedRoles, ["CITIZEN"], "첫 직업(귀족)의 서버 코드로 랭킹을 조회해야 한다.")

  await act(async () => {
    resolveStats()
  })

  await waitFor(() => assert.equal(statRowText(view.container, "플레이 횟수"), "플레이 횟수10"))
  assert.equal(statRowText(view.container, "승률"), "승률60%")
  assert.equal(statRowText(view.container, "생존 횟수"), "생존 횟수4")
})

test("F-18 AC-06: 직업 탭을 바꾸면 그 직업의 판수·승률로 바뀐다(다른 직업 값이 남지 않는다)", async () => {
  myRoleStatisticsHandler = async () => [
    { role: "CITIZEN", games: 10, wins: 6, survivalCount: 4, winRate: 0.6 },
    { role: "JOKER", games: 20, wins: 5, survivalCount: 1, winRate: 0.25 },
  ]

  const view = await mountSpread()
  await waitFor(() => assert.equal(statRowText(view.container, "플레이 횟수"), "플레이 횟수10"))

  await act(async () => {
    fireEvent.click(view.getByRole("tab", { name: "광대" }))
  })

  await waitFor(() => assert.equal(statRowText(view.container, "플레이 횟수"), "플레이 횟수20"))
  assert.equal(statRowText(view.container, "승률"), "승률25%")
  assert.deepEqual(requestedRoles, ["CITIZEN", "JOKER"])
})

test("F-18 AC-06: 0판 계정과 빈 랭킹은 0 그대로와 안내 문구로 표시된다(다른 값으로 메우지 않는다)", async () => {
  myRoleStatisticsHandler = async () => [{ role: "CITIZEN", games: 0, wins: 0, survivalCount: 0, winRate: 0 }]
  roleRankingHandler = async () => ({ ranking: [] })

  const view = await mountSpread()

  await waitFor(() => assert.equal(statRowText(view.container, "플레이 횟수"), "플레이 횟수0"))
  assert.equal(statRowText(view.container, "승률"), "승률0%")
  assert.ok(view.container.textContent.includes("최소 10판 이상 플레이한 사용자가 아직 없습니다."))
})

test("F-18 AC-06: 조회가 실패하면 안내와 다시 시도가 나오고, 다시 시도하면 실제 표가 복구된다", async () => {
  let attempt = 0
  myRoleStatisticsHandler = async () => {
    attempt += 1
    if (attempt === 1) throw new Error("전적을 불러오지 못했습니다.")
    return [{ role: "CITIZEN", games: 12, wins: 6, survivalCount: 3, winRate: 0.5 }]
  }
  roleRankingHandler = async () => ({
    ranking: [{ rank: 1, uuid: "u1", nickname: "일등", games: 30, wins: 24, winRate: 0.8 }],
  })

  const view = await mountSpread()

  await waitFor(() => assert.ok(view.container.textContent.includes("전적을 불러오지 못했습니다.")))
  const retryButtons = view.getAllByRole("button", { name: "다시 시도" })
  assert.ok(retryButtons.length > 0, "실패했으면 사용자가 다시 시도할 수단이 있어야 한다.")

  await act(async () => {
    fireEvent.click(retryButtons[0])
  })

  await waitFor(() => assert.equal(statRowText(view.container, "플레이 횟수"), "플레이 횟수12"))
  assert.equal(view.queryAllByRole("button", { name: "다시 시도" }).length, 0)
  assert.ok(view.getByText("일등"), "랭킹 표도 함께 복구되어야 한다.")
})

test("F-18 AC-06: 5명을 넘는 랭킹은 잘리지 않고 다음 페이지에서 나머지 행을 볼 수 있다", async () => {
  myRoleStatisticsHandler = async () => [{ role: "CITIZEN", games: 10, wins: 6, survivalCount: 4, winRate: 0.6 }]
  roleRankingHandler = async () => ({
    ranking: Array.from({ length: 7 }, (_, index) => ({
      rank: index + 1,
      uuid: `u${index}`,
      nickname: `유저${index + 1}`,
      games: 20 - index,
      wins: 10,
      winRate: 0.5,
    })),
  })

  const view = await mountSpread()

  await waitFor(() => assert.ok(view.queryByText("유저1")))
  assert.equal(view.queryByText("유저6"), null, "한 페이지에는 5명까지만 보인다.")
  assert.ok(view.container.textContent.includes("1 / 2"))

  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "다음 랭킹 페이지" }))
  })

  await waitFor(() => assert.ok(view.queryByText("유저6")))
  assert.ok(view.queryByText("유저7"), "마지막 페이지에 나머지 행이 모두 있어야 한다.")
  assert.equal(view.queryByText("유저1"), null)
  assert.ok(view.container.textContent.includes("2 / 2"))
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
