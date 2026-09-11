import assert from "node:assert/strict"
import test from "node:test"
import {
  resolveAccountProfileAssets,
  resolveAccountProfileBorderSrc,
  resolveAccountProfilePhotoSrc,
} from "../resolveAccountProfileAssets.js"
import { PLAYER_PROFILE_ASSETS } from "../../constants/playerProfileAssets.js"

// F-13 AC-05 — 서버 사진·테두리 itemId를 실제 public 자산 경로로 바꾸는 계약(A-03)을 고정한다.
// 이 함수가 로비·마이페이지·친구·서고·대기방·인게임 등 모든 표시 경로가 공유하는 유일한
// "asset id -> src" 변환 지점이므로, 여기서 규칙이 깨지면 모든 화면이 동시에 어긋난다.

test("유효한 player-profile-* itemId는 실제 사진 자산 경로로 바뀐다", () => {
  assert.equal(
    resolveAccountProfilePhotoSrc("player-profile-기사"),
    "/shopItem/player-profile/프로필-기사.png".normalize("NFD"),
  )
})

test("유효한 profile-border-* itemId는 실제 테두리 자산 경로로 바뀐다", () => {
  assert.equal(
    resolveAccountProfileBorderSrc("profile-border-귀족"),
    "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"),
  )
})

test("규칙을 따르지 않는 사진 itemId는 null을 돌려준다(호출부가 기본 자산으로 대체)", () => {
  assert.equal(resolveAccountProfilePhotoSrc("../../../etc/passwd"), null)
  assert.equal(resolveAccountProfilePhotoSrc(""), null)
  assert.equal(resolveAccountProfilePhotoSrc(undefined), null)
  assert.equal(resolveAccountProfilePhotoSrc(null), null)
})

test("규칙을 따르지 않는 테두리 itemId는 null을 돌려준다(호출부가 기본 자산으로 대체)", () => {
  assert.equal(resolveAccountProfileBorderSrc("profile-border-"), null)
  assert.equal(resolveAccountProfileBorderSrc(123), null)
})

test("resolveAccountProfileAssets: 사진·테두리가 둘 다 유효하면 각각 실제 자산으로, 서로 독립적으로 해석된다", () => {
  const result = resolveAccountProfileAssets({
    accountProfilePhotoId: "player-profile-기사",
    accountProfileBorderId: "profile-border-귀족",
  })
  assert.equal(result.portraitSrc, resolveAccountProfilePhotoSrc("player-profile-기사"))
  assert.equal(result.frameSrc, resolveAccountProfileBorderSrc("profile-border-귀족"))
})

test("resolveAccountProfileAssets: 사진만 유효해도 테두리는 기본값으로만 대체되고 사진은 그대로 반영된다", () => {
  const result = resolveAccountProfileAssets({ accountProfilePhotoId: "player-profile-기사" })
  assert.equal(result.portraitSrc, resolveAccountProfilePhotoSrc("player-profile-기사"))
  assert.equal(result.frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
})

test("resolveAccountProfileAssets: 아무 id도 없으면 사진·테두리 모두 기본 자산이다(대기방 더미 슬롯 등)", () => {
  const result = resolveAccountProfileAssets()
  assert.equal(result.portraitSrc, PLAYER_PROFILE_ASSETS.defaultPhoto)
  assert.equal(result.frameSrc, PLAYER_PROFILE_ASSETS.defaultBorder)
})

test("resolveAccountProfileAssets: 서로 다른 계정 id는 서로 다른 결과를 낸다(대기방 슬롯이 구분되어야 하는 이유)", () => {
  const a = resolveAccountProfileAssets({ accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-평민" })
  const b = resolveAccountProfileAssets({ accountProfilePhotoId: "player-profile-드워프", accountProfileBorderId: "profile-border-귀족" })
  assert.notEqual(a.portraitSrc, b.portraitSrc)
  assert.notEqual(a.frameSrc, b.frameSrc)
})
