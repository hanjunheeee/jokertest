import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"
import { resolveAccountProfileAssets } from "../../../../src/shared/utils/resolveAccountProfileAssets.js"

mock.module("../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "http://test-api.local" },
})

let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
mock.module("../../../../src/shared/api/client.js", {
  namedExports: {
    api: {
      get: (...args) => getImpl(...args),
      post: (...args) => postImpl(...args),
    },
  },
})
mock.module("../../../../src/domains/auth/store/auth.store.js", {
  namedExports: {
    useAuthStore: {
      getState: () => ({ user: { uuid: "user-1" } }),
      subscribe: () => () => {},
    },
  },
})

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, waitFor, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: FriendListRow } = await import("../../../../src/domains/lobby/components/friendList/list/FriendListRow.jsx")
const { default: InvitedGuestsRankingRow } =
  await import("../../../../src/domains/library/components/invitedGuests/shared/InvitedGuestsRankingRow.jsx")
const { default: LobbyProfileArea } = await import("../../../../src/domains/lobby/components/LobbyProfileArea.jsx")
const { useEconomyStore } = await import("../../../../src/domains/economy/store/economy.store.js")
const { default: MyPageBannerButton } = await import("../../../../src/domains/user/components/MyPageBannerButton.jsx")
const { default: BloodRecordFrame } = await import("../../../../src/domains/user/components/BloodRecordFrame.jsx")
const { MY_PAGE_PROFILE_BANNER_DEFAULTS } = await import("../../../../src/domains/user/constants/myPageAssets.js")

test("로비: 실제 LobbyProfileArea를 마운트하면(showProfilePortrait 배선을 거쳐) 서버가 실제로 응답한 계정 사진·테두리가 배너에 실제 DOM img로 그려진다", async () => {
  useEconomyStore.getState().reset()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : {
      entitlements: [],
      loadout: { selectedProfilePhotoId: "player-profile-기사", selectedProfileBorderId: "profile-border-귀족" },
    })

  const { container } = render(React.createElement(LobbyProfileArea, {
    profile: { nickname: "초심자", title: "신참" },
    loading: false,
    onMyPage: () => {},
    onAccount: () => {},
  }))

  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: "player-profile-기사",
    accountProfileBorderId: "profile-border-귀족",
  })

  await waitFor(() => {
    const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
    assert.ok(imgSrcs.includes(portraitSrc.normalize("NFC")), "실제 DOM에 계정 사진 img가 없다")
    assert.ok(imgSrcs.includes(frameSrc.normalize("NFC")), "실제 DOM에 계정 테두리 img가 없다")
  })
})

test("로비: 장착 사진·테두리가 없는(loadout 기본값) 계정은 기본 자산으로 안전하게 대체되어 렌더된다", async () => {
  useEconomyStore.getState().reset()
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout: { selectedProfilePhotoId: null, selectedProfileBorderId: null } })

  const { container } = render(React.createElement(LobbyProfileArea, {
    profile: { nickname: "초심자", title: "신참" },
    loading: false,
    onMyPage: () => {},
    onAccount: () => {},
  }))

  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({})
  await waitFor(() => {
    const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
    assert.ok(imgSrcs.includes(portraitSrc.normalize("NFC")))
    assert.ok(imgSrcs.includes(frameSrc.normalize("NFC")))
  })
})

test("친구 목록: 실제 FriendListRow를 마운트하면 계정별 accountProfilePhotoId/accountProfileBorderId가 resolveAccountProfileAssets로 해석되어 실제 DOM img src로 그려진다", () => {
  const { container } = render(React.createElement(FriendListRow, {
    id: "friend-1",
    name: "친구닉네임",
    online: true,
    accountProfilePhotoId: "player-profile-기사",
    accountProfileBorderId: "profile-border-귀족",
  }))

  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: "player-profile-기사",
    accountProfileBorderId: "profile-border-귀족",
  })
  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
  assert.ok(imgSrcs.includes(portraitSrc.normalize("NFC")), "실제 DOM에 해석된 계정 사진 img가 없다")
  assert.ok(imgSrcs.includes(frameSrc.normalize("NFC")), "실제 DOM에 해석된 계정 테두리 img가 없다")
})

test("친구 목록: 계정 프로필 id가 없는 친구(백엔드 필드 미도착/미보유)는 기본 자산으로 안전하게 대체되어 렌더된다", () => {
  const { container } = render(React.createElement(FriendListRow, {
    id: "friend-2",
    name: "미장착친구",
    online: false,
    accountProfilePhotoId: undefined,
    accountProfileBorderId: undefined,
  }))

  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({})
  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
  assert.ok(imgSrcs.includes(portraitSrc.normalize("NFC")))
  assert.ok(imgSrcs.includes(frameSrc.normalize("NFC")))
})

test("친구 목록 자산 해석 자체는 순수 함수 계약을 따른다 — 친구마다 다른 id는 다른 결과를 낸다", () => {
  const friendA = resolveAccountProfileAssets({ accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-평민" })
  const friendB = resolveAccountProfileAssets({ accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-귀족" })
  assert.notEqual(friendA.portraitSrc, friendB.portraitSrc)
  assert.notEqual(friendA.frameSrc, friendB.frameSrc)
})

test("서고 랭킹: 실제 InvitedGuestsRankingRow를 마운트하면 profileSrc/profileBorderSrc가 실제 DOM img src로 그려진다", () => {
  const profileSrc = "/shopItem/player-profile/프로필-기사.png".normalize("NFD")
  const profileBorderSrc = "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD")
  const { container } = render(React.createElement("table", null, React.createElement("tbody", null,
    React.createElement(InvitedGuestsRankingRow, {
      rank: 1, profileSrc, profileBorderSrc, nickname: "닉1", playCount: 12, winRate: 0.5,
    }),
  )))

  const imgSrcs = [...container.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src")))
  assert.ok(imgSrcs.includes(profileSrc.normalize("NFC")), "실제 DOM에 프로필 사진 img가 없다")
  assert.ok(imgSrcs.includes(profileBorderSrc.normalize("NFC")), "실제 DOM에 프로필 테두리 img가 없다")
})

test("서고 랭킹: 실제 장착 테두리가 없는 참가자(profileBorderSrc=null)는 테두리 img를 그리지 않고 사진만 그린다", () => {
  const profileSrc = "/shopItem/player-profile/프로필-금빛가면.png"
  const { container } = render(React.createElement("table", null, React.createElement("tbody", null,
    React.createElement(InvitedGuestsRankingRow, {
      rank: 2, profileSrc, profileBorderSrc: null, nickname: "닉2", playCount: 10, winRate: 0.3,
    }),
  )))

  assert.equal(container.querySelectorAll("img").length, 1, "테두리가 없으면 사진 img 하나만 그려야 한다")
})

test("서고 랭킹: 상위 변환(mergeInvitedGuestsSpreads)은 이제 gameResult.repositories.js의 getRoleRanking이 내려주는 실제 accountProfilePhotoId/accountProfileBorderId를 resolveAccountProfileAssets와 같은 규칙으로 해석해 profileSrc/profileBorderSrc를 채운다(운영자 확장 승인 반영, 더 이상 항상 null로 고정하지 않는다)", async () => {
  const { mergeInvitedGuestsSpreads } = await import("../../../../src/domains/library/content/invitedGuests/mergeInvitedGuestsSpreads.js")

  const spreadMeta = [{ id: "s1", jobKey: "noble" }]
  const catalog = { noble: { jobName: "귀족", description: "", standingImage: "", standingImageClass: "", standingImageWrapClass: "" } }
  const challenges = { noble: [{ id: "noble-win-10" }] }
  const jobState = {
    byJobKey: {
      noble: {
        status: "success",
        myStats: null,
        error: null,
        achievementsById: {},
        ranking: [
          {
            rank: 1, uuid: "u1", nickname: "닉1",
            accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족",
            games: 12, wins: 6, winRate: 0.5,
          },
          { rank: 2, uuid: "u2", nickname: "닉2", accountProfilePhotoId: null, accountProfileBorderId: null, games: 10, wins: 3, winRate: 0.3 },
        ],
      },
    },
  }

  const [spread] = mergeInvitedGuestsSpreads(spreadMeta, catalog, challenges, jobState)
  const [withAppearance, withoutAppearance] = spread.right.ranking

  assert.equal(withAppearance.profileSrc, "/shopItem/player-profile/프로필-기사.png".normalize("NFD"))
  assert.equal(withAppearance.profileBorderSrc, "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"))
  assert.equal(withoutAppearance.profileBorderSrc, null, "실제 장착 테두리가 없으면 기존처럼 null로 남아 테두리 없이 그려야 한다")
  assert.equal(withoutAppearance.profileSrc, "/shopItem/player-profile/프로필-금빛가면.png", "계정 사진도 없으면 기존 하드코딩 기본 사진으로 대체되어야 한다")
})

const installEquipmentApi = (loadout) => {
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout })
}

const paragraphTexts = (container) =>
  [...container.querySelectorAll("p")].map((node) => node.textContent.trim())

const hasClassFragment = (container, fragment) =>
  [...container.querySelectorAll("*")].some((node) =>
    typeof node.className === "string" && node.className.includes(fragment))

const NO_SPACE_MAX_NICKNAME = "여덟자짜리닉네임"
const BANNER_PROFILE = { nickname: NO_SPACE_MAX_NICKNAME, title: "무자비한 광대" }

const IN_BOUNDS_TEXT_RULES = ["[overflow-wrap:anywhere]", "break-words", "break-all", "truncate", "line-clamp"]

for (const [label, props] of [
  ["로비", { showText: true, showProfilePortrait: true, showSettingsIcon: true, onSettingsClick: () => {}, onClick: () => {} }],
  ["마이페이지", { ...MY_PAGE_PROFILE_BANNER_DEFAULTS }],
]) {
  test(`${label} 배너: 실제 MyPageBannerButton을 마운트하면 닉네임만 남고 명성 이름·값·구분선·빈 트랙이 전부 사라진다`, async () => {
    useEconomyStore.getState().reset()
    installEquipmentApi({ selectedProfilePhotoId: null, selectedProfileBorderId: null })

    const { container } = render(React.createElement(MyPageBannerButton, { ...props, profile: BANNER_PROFILE }))

    assert.deepEqual(paragraphTexts(container), [NO_SPACE_MAX_NICKNAME], "배너 텍스트 문단은 닉네임 하나뿐이어야 한다")

    const nicknameNode = container.querySelector("p")
    const nicknameClass = nicknameNode.className
    for (const fragment of ["app-text-scaled", "max-w-full"]) {
      assert.ok(nicknameClass.includes(fragment), `닉네임에 ${fragment} 계약이 없다`)
    }

    assert.ok(
      IN_BOUNDS_TEXT_RULES.some((rule) => nicknameClass.includes(rule)),
      `공백 없는 닉네임을 영역 안에 두는 줄바꿈·말줄임 규칙이 없다: ${nicknameClass}`,
    )

    assert.equal(
      nicknameClass.includes("break-keep") && !IN_BOUNDS_TEXT_RULES.some((rule) => nicknameClass.includes(rule)),
      false,
      "break-keep 단독으로는 공백 없는 한글 닉네임이 영역 안에서 접히지 않는다",
    )

    assert.equal(/명성/.test(container.textContent), false, "명성 이름이 아직 그려진다")
    assert.equal(container.textContent.includes("1280"), false)

    assert.equal(hasClassFragment(container, "grid-rows-[1fr_auto_1fr]"), false, "명성 자리를 만들던 빈 트랙이 남아 있다")
    assert.equal(hasClassFragment(container, "-translate-y-[0.18rem]"), false, "명성 구분선이 남아 있다")

    assert.equal(container.textContent.includes("무자비한 광대"), false, "이번 범위에서 칭호 표시를 새로 추가하지 않는다")
  })
}

test("피의 기록: 실제 BloodRecordFrame을 마운트하면 전체 판수·승률 두 행만 그 순서로 그려진다(생존·처형 없음)", () => {
  const { container } = render(React.createElement(BloodRecordFrame, {
    stats: [
      { label: "전체 판수", value: "1,245" },
      { label: "승률", value: "66.7%" },
    ],
  }))

  const texts = [...container.querySelectorAll("span")].map((node) => node.textContent.trim())
  assert.deepEqual(texts, ["전체 판수", "1,245", "승률", "66.7%"], "행 순서·개수가 두 항목 계약과 다르다")
  assert.equal(container.textContent.includes("생존 횟수"), false)
  assert.equal(container.textContent.includes("단두대 처형"), false)

  for (const node of container.querySelectorAll("span")) {
    assert.ok(node.className.includes("app-text-scaled"), "기록 글자가 앱 배율을 따르지 않는다")
    assert.ok(node.className.includes("leading-snug"), "기록 줄 높이가 여전히 leading-none이다")
    assert.equal(node.className.includes("leading-none"), false)
    assert.ok(node.className.includes("min-w-0"), "기록 행이 좁은 폭에서 줄어들 수 없다")
  }
  assert.ok([...container.querySelectorAll("span")].at(1).className.includes("tabular-nums"))
})

test("피의 기록: stats를 넘기지 않으면 예시 더미 기록이 아니라 아무 행도 그리지 않는다", () => {
  const { container } = render(React.createElement(BloodRecordFrame, null))

  assert.deepEqual([...container.querySelectorAll("span")].map((n) => n.textContent.trim()), [])
  for (const dummy of ["1,245", "788", "112", "전체 판수", "생존 횟수", "단두대 처형"]) {
    assert.equal(container.textContent.includes(dummy), false, `더미 기록(${dummy})이 남아 있다`)
  }
})
