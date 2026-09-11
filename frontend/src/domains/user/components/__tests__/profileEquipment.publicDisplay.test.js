import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { readFile } from "node:fs/promises"
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

// F-13 AC-05(CURRENT OPERATOR CORRECTION) — "implement missing photo/border fields in
// profile/friend/ranking responses ... retain them through client transforms and supply
// actual image/border assets to portrait components". 이 파일은 로비·마이페이지·친구·서고
// 표시 경로가 실제로 resolveAccountProfileAssets를 통해 계정별 자산을 그리도록 배선되어
// 있는지 고정한다.
//
// F-13(CODEX-4) 재검토: 친구 목록·서고 랭킹 두 컴포넌트는 raw source 정규식 대신 실제
// jsdom 렌더로 바꿨다 — frontend/.../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs가
// 이미 만든 module.register() ESM 훅(oxc 변환 + "@/" alias 해석)을 그대로 재사용해 이
// 저장소의 node:test 실행 제약(vite alias·JSX 미해석)을 없앤다. 두 컴포넌트는 props만으로
// 결정되는 순수 표시 컴포넌트라 store/네트워크 mock 없이 그대로 마운트할 수 있다. 로비
// 배너(LobbyProfileArea → MyPageBannerButton → BannerProfilePortrait)는 마운트 시
// profileCustomization store·economy store의 실제 fetchSummary(네트워크)까지 함께 끌려와
// 이 파일의 범위를 넘으므로 source 검증을 유지한다.
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

const { render, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: FriendListRow } = await import("../../../lobby/components/friendList/list/FriendListRow.jsx")
const { default: InvitedGuestsRankingRow } =
  await import("../../../library/components/invitedGuests/shared/InvitedGuestsRankingRow.jsx")

const lobbyProfileAreaUrl = new URL("../../../lobby/components/LobbyProfileArea.jsx", import.meta.url)

test("로비: LobbyProfileArea가 showProfilePortrait를 켜야 배너에 실제 장착 사진·테두리가 그려진다", async () => {
  const source = await readFile(lobbyProfileAreaUrl, "utf8")
  assert.match(
    source,
    /<MyPageBannerButton[\s\S]*?showProfilePortrait[\s\S]*?\/>/,
    "showProfilePortrait를 넘기지 않으면 BannerMainButton이 BannerProfilePortrait를 아예 렌더하지 않아 로비 배너에 사진이 전혀 보이지 않는다",
  )
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
