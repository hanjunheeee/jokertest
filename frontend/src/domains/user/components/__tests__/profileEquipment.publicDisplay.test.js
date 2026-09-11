import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { resolveAccountProfileAssets } from "../../../../shared/utils/resolveAccountProfileAssets.js"

// F-13 AC-05(CURRENT OPERATOR CORRECTION) — "implement missing photo/border fields in
// profile/friend/ranking responses ... retain them through client transforms and supply
// actual image/border assets to portrait components". 이 파일은 로비·마이페이지·친구·서고
// 표시 경로가 실제로 resolveAccountProfileAssets를 통해 계정별 자산을 그리도록 배선되어
// 있는지 고정한다. 대상 컴포넌트는 전부 .jsx이고 vite alias(@/...)를 타므로 이 저장소의
// node:test 실행에서는 렌더는커녕 resolve조차 되지 않는다(InGamePlayerCard.playerColor.test.js
// 와 동일한 제약, ForbiddenRecordsUnlockCondition.js 관례) — raw source 검증으로 실제
// production 배선을 증명하고, 자산 변환 자체는 순수 함수라 직접 호출해 검증한다
// (resolveAccountProfileAssets.test.js가 그 계약을 더 촘촘히 고정한다).

const lobbyProfileAreaUrl = new URL("../../../lobby/components/LobbyProfileArea.jsx", import.meta.url)
const friendListRowUrl = new URL("../../../lobby/components/friendList/list/FriendListRow.jsx", import.meta.url)
const invitedGuestsRankingRowUrl =
  new URL("../../../library/components/invitedGuests/shared/InvitedGuestsRankingRow.jsx", import.meta.url)

test("로비: LobbyProfileArea가 showProfilePortrait를 켜야 배너에 실제 장착 사진·테두리가 그려진다", async () => {
  const source = await readFile(lobbyProfileAreaUrl, "utf8")
  assert.match(
    source,
    /<MyPageBannerButton[\s\S]*?showProfilePortrait[\s\S]*?\/>/,
    "showProfilePortrait를 넘기지 않으면 BannerMainButton이 BannerProfilePortrait를 아예 렌더하지 않아 로비 배너에 사진이 전혀 보이지 않는다",
  )
})

test("친구 목록: FriendListRow는 계정별 accountProfilePhotoId/accountProfileBorderId를 받아 resolveAccountProfileAssets로 해석한 뒤 PlayerProfilePortrait에 넘긴다", async () => {
  const source = await readFile(friendListRowUrl, "utf8")
  assert.match(source, /accountProfilePhotoId,\s*accountProfileBorderId/, "친구별 계정 프로필 id를 props로 받아야 한다")
  assert.match(source, /resolveAccountProfileAssets\(\{\s*accountProfilePhotoId,\s*accountProfileBorderId\s*\}\)/)
  assert.match(source, /<PlayerProfilePortrait[\s\S]*?photoSrc=\{portraitSrc\}[\s\S]*?frameSrc=\{frameSrc\}/, "해석된 자산을 실제로 PlayerProfilePortrait에 전달해야 화면에 반영된다")
})

test("친구 목록 자산 해석 자체는 순수 함수 계약을 따른다 — 친구마다 다른 id는 다른 결과를 낸다", () => {
  const friendA = resolveAccountProfileAssets({ accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-평민" })
  const friendB = resolveAccountProfileAssets({ accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-귀족" })
  assert.notEqual(friendA.portraitSrc, friendB.portraitSrc)
  assert.notEqual(friendA.frameSrc, friendB.frameSrc)
})

test("서고 랭킹: InvitedGuestsRankingRow는 이미 profileSrc/profileBorderSrc를 그대로 InvitedGuestsRankingProfile에 전달한다(컴포넌트 자체는 정상)", async () => {
  const source = await readFile(invitedGuestsRankingRowUrl, "utf8")
  assert.match(source, /<InvitedGuestsRankingProfile profileSrc=\{profileSrc\} profileBorderSrc=\{profileBorderSrc\} \/>/)
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
