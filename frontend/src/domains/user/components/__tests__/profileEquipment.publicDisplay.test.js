import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"
import { resolveAccountProfileAssets } from "../../../../shared/utils/resolveAccountProfileAssets.js"

// FriendListRow → useFriendStore → friend.api.js → shared/api/client.js → shared/env.js가
// import.meta.env(Vite 빌드타임 치환)를 읽는다 — client.test.js/useSocket.test.js와 같은
// 관례로 env.js 하나만 갈아끼워 나머지는 실제 코드 그대로 마운트한다(FriendListRow는 실제로
// api를 호출하지 않으므로 client.js 자체는 실제 코드를 그대로 쓴다).
mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "http://test-api.local" },
})

// F-13 AC-05(CODEX-5 재검토) — 로비 배너(LobbyProfileArea → MyPageBannerButton →
// BannerProfilePortrait)는 이전까지 readFile 소스 정규식으로만 "showProfilePortrait를
// 켰는지"를 확인했을 뿐, 실제로 서버가 응답한 계정 사진·테두리가 화면에 그려지는지는
// 전혀 증명하지 못했다("공개 표시는 로비의 경우 소스 정규식이어서 검증 부족" 반송 지적).
// BannerProfilePortrait는 마운트 시 useEconomyStore.getState().fetchSummary()(실제 네트워크
// GET)를 호출하고 profileCustomization store(useEconomyStore를 구독)를 거쳐 photoSrc/
// frameSrc를 반영하므로, api.client와 auth store만 이 파일 전용으로 갈아끼우고(economy.
// store.test.js와 같은 최소 흉내) 나머지(economy store·profileCustomization store·
// BannerProfilePortrait 전부)는 실제 코드 그대로 마운트해 실제 DOM img src까지 확인한다.
let getImpl = async () => { throw new Error("api.get stub not set") }
let postImpl = async () => { throw new Error("api.post stub not set") }
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
      getState: () => ({ user: { uuid: "user-1" } }),
      subscribe: () => () => {},
    },
  },
})

// F-13 AC-05(CURRENT OPERATOR CORRECTION) — "implement missing photo/border fields in
// profile/friend/ranking responses ... retain them through client transforms and supply
// actual image/border assets to portrait components". 이 파일은 로비·마이페이지·친구·서고
// 표시 경로가 실제로 resolveAccountProfileAssets를 통해 계정별 자산을 그리도록 배선되어
// 있는지 고정한다.
//
// F-13(CODEX-4) 재검토: 친구 목록·서고 랭킹 두 컴포넌트는 raw source 정규식 대신 실제
// jsdom 렌더로 바꿨다 — frontend/.../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs가
// 이미 만든 module.register() ESM 훅(TypeScript transpileModule 변환 + "@/" alias 해석)을 그대로 재사용해 이
// 저장소의 node:test 실행 제약(vite alias·JSX 미해석)을 없앤다. 두 컴포넌트는 props만으로
// 결정되는 순수 표시 컴포넌트라 store/네트워크 mock 없이 그대로 마운트할 수 있다.
//
// F-13(CODEX-5) 재검토: 로비 배너(LobbyProfileArea → MyPageBannerButton →
// BannerProfilePortrait)도 더 이상 source 정규식에 머무르지 않는다 — 위 api.client·auth
// store mock만으로 실제 economy store의 fetchSummary(네트워크)·profileCustomization
// store(economy store 구독)까지 전부 실제 코드 그대로 마운트해, 서버가 응답한 계정 사진·
// 테두리가 실제 DOM img로 그려지는지 직접 확인한다.
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
register(new URL("../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, waitFor, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: FriendListRow } = await import("../../../lobby/components/friendList/list/FriendListRow.jsx")
const { default: InvitedGuestsRankingRow } =
  await import("../../../library/components/invitedGuests/shared/InvitedGuestsRankingRow.jsx")
const { default: LobbyProfileArea } = await import("../../../lobby/components/LobbyProfileArea.jsx")
const { useEconomyStore } = await import("../../../economy/store/economy.store.js")
// F-30 AC-01/AC-04/AC-06: 배너와 피의 기록의 **최종 DOM**을 직접 본다 — 명성이 남아 있는지,
// 기록이 정확히 두 행인지는 훅 반환값이 아니라 실제로 그려진 요소에서 판정해야 한다.
const { default: MyPageBannerButton } = await import("../MyPageBannerButton.jsx")
const { default: BloodRecordFrame } = await import("../BloodRecordFrame.jsx")
const { MY_PAGE_PROFILE_BANNER_DEFAULTS } = await import("../../constants/myPageAssets.js")

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
  const { mergeInvitedGuestsSpreads } = await import("../../../library/content/invitedGuests/mergeInvitedGuestsSpreads.js")

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
          // 실제 장착 테두리가 없는 계정(미보유/구 계정)은 테두리 없이 그려야 한다.
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

// ── F-30 AC-04/AC-06: 공통 프로필 배너에서 명성이 이름·값·장식·빈 자리까지 사라졌다 ──

const installEquipmentApi = (loadout) => {
  getImpl = async (endpoint) => (endpoint.endsWith("/wallet")
    ? { balanceGold: 0, balanceDiamond: 0 }
    : { entitlements: [], loadout })
}

/** 배너가 그린 실제 텍스트 문단들(사진·테두리 img는 세지 않는다). */
const paragraphTexts = (container) =>
  [...container.querySelectorAll("p")].map((node) => node.textContent.trim())

/** 명성 전용 장식이었던 세 트랙 grid와 구분선이 클래스 수준에서도 남아 있지 않은지. */
const hasClassFragment = (container, fragment) =>
  [...container.querySelectorAll("*")].some((node) =>
    typeof node.className === "string" && node.className.includes(fragment))

const BANNER_PROFILE = { nickname: "여덟자닉네임입", title: "무자비한 광대" }

for (const [label, props] of [
  ["로비", { showText: true, showProfilePortrait: true, showSettingsIcon: true, onSettingsClick: () => {}, onClick: () => {} }],
  ["마이페이지", { ...MY_PAGE_PROFILE_BANNER_DEFAULTS }],
]) {
  test(`${label} 배너: 실제 MyPageBannerButton을 마운트하면 닉네임만 남고 명성 이름·값·구분선·빈 트랙이 전부 사라진다`, async () => {
    useEconomyStore.getState().reset()
    installEquipmentApi({ selectedProfilePhotoId: null, selectedProfileBorderId: null })

    const { container } = render(React.createElement(MyPageBannerButton, { ...props, profile: BANNER_PROFILE }))

    // 닉네임은 그대로 보인다.
    assert.deepEqual(paragraphTexts(container), ["여덟자닉네임입"], "배너 텍스트 문단은 닉네임 하나뿐이어야 한다")

    // F-30 AC-06: 앱 글자 배율을 계속 따르고(app-text-scaled), 폭이 모자라면 잘리지 않고
    // 영역 안에서 접힌다(max-w-full + break-keep) — 확대 글자·좁은 화면의 넘침을 막는다.
    const nicknameNode = container.querySelector("p")
    for (const fragment of ["app-text-scaled", "max-w-full", "break-keep"]) {
      assert.ok(nicknameNode.className.includes(fragment), `닉네임에 ${fragment} 계약이 없다`)
    }

    // 명성 이름도 값도 화면 어디에도 없다.
    assert.equal(/명성/.test(container.textContent), false, "명성 이름이 아직 그려진다")
    assert.equal(container.textContent.includes("1280"), false)

    // 명성 전용 장식(중간 구분선)과 명성 자리를 만들던 세 트랙 grid도 남아 있지 않다.
    assert.equal(hasClassFragment(container, "grid-rows-[1fr_auto_1fr]"), false, "명성 자리를 만들던 빈 트랙이 남아 있다")
    assert.equal(hasClassFragment(container, "-translate-y-[0.18rem]"), false, "명성 구분선이 남아 있다")

    // 닉네임·칭호는 보존 대상이다 — title을 넘겨도 배너가 임의의 칭호 UI를 새로 만들지는 않는다.
    assert.equal(container.textContent.includes("무자비한 광대"), false, "이번 범위에서 칭호 표시를 새로 추가하지 않는다")
  })
}

// ── F-30 AC-01/AC-06: 피의 기록은 정확히 두 항목이고 더미 기록이 남지 않았다 ──

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

  // F-30 AC-06: 두 행 모두 앱 글자 배율을 따르고, leading-none이 아니라 정상 줄 높이로
  // 접힐 수 있어야 한다(확대 글자에서 두 줄이 되어도 줄끼리 붙지 않는다).
  for (const node of container.querySelectorAll("span")) {
    assert.ok(node.className.includes("app-text-scaled"), "기록 글자가 앱 배율을 따르지 않는다")
    assert.ok(node.className.includes("leading-snug"), "기록 줄 높이가 여전히 leading-none이다")
    assert.equal(node.className.includes("leading-none"), false)
    assert.ok(node.className.includes("min-w-0"), "기록 행이 좁은 폭에서 줄어들 수 없다")
  }
  // 값 쪽은 숫자 폭이 흔들리지 않도록 tabular-nums를 유지한다.
  assert.ok([...container.querySelectorAll("span")].at(1).className.includes("tabular-nums"))
})

test("피의 기록: stats를 넘기지 않으면 예시 더미 기록이 아니라 아무 행도 그리지 않는다", () => {
  const { container } = render(React.createElement(BloodRecordFrame, null))

  assert.deepEqual([...container.querySelectorAll("span")].map((n) => n.textContent.trim()), [])
  // 예전 더미 값(1,245 · 788 · 112)이 실제 전적처럼 보이면 안 된다.
  for (const dummy of ["1,245", "788", "112", "전체 판수", "생존 횟수", "단두대 처형"]) {
    assert.equal(container.textContent.includes(dummy), false, `더미 기록(${dummy})이 남아 있다`)
  }
})
