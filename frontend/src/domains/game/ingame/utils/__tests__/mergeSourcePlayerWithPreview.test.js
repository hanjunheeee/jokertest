import test from "node:test"
import assert from "node:assert/strict"
import { mergeSourcePlayerWithPreview } from "../mergeSourcePlayerWithPreview.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"
import { INGAME_PLAYER_THEME_PALETTE } from "../../constants/ingamePlayerTheme.js"

function preview() {
  return { id: "player-slot-1", nickname: "플레이어 1", portraitSrc: "p.png", frameSrc: "f.png", themeIndex: 0, theme: {} }
}

test("서버 themeIndex가 있으면 preview의 색을 덮어쓰고 theme도 그 인덱스로 다시 계산된다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, themeIndex: 4 },
    preview(),
  )
  assert.equal(result.themeIndex, 4)
  assert.equal(result.theme.paletteIndex, 4)
  assert.equal(result.theme.color, INGAME_PLAYER_THEME_PALETTE[4].color)
})

test("입력 player에 themeIndex 키가 없으면 preview의 themeIndex/theme이 그대로 유지된다", () => {
  const source = preview()
  const result = mergeSourcePlayerWithPreview({ id: "u2", name: "B", connected: true, alive: true }, source)
  assert.equal(result.themeIndex, source.themeIndex)
  assert.equal(result.theme, source.theme)
})

test("입력 player에 role이 있으면 출력에 같은 값의 role이 있다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, role: "JOKER" },
    preview(),
  )
  assert.equal(result.role, "JOKER")
})

test("입력 player에 role 키 자체가 없으면 출력에도 role 키가 없다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(result, "role"), false)
})

test("team도 동일하게 있으면 복사되고 없으면 키 자체가 생기지 않는다", () => {
  const withTeam = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, team: "MAFIA" },
    preview(),
  )
  assert.equal(withTeam.team, "MAFIA")

  const withoutTeam = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(withoutTeam, "team"), false)
})

test("isAlly:true인 입력은 출력에도 isAlly:true가 있다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, isAlly: true },
    preview(),
  )
  assert.equal(result.isAlly, true)
})

test("입력 player에 isAlly 키 자체가 없으면 출력에도 isAlly 키가 없다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(result, "isAlly"), false)
})

test("connected:false는 DISCONNECTED로 계산된다", () => {
  const result = mergeSourcePlayerWithPreview({ id: "u1", name: "A", connected: false, alive: true }, preview())
  assert.equal(result.status, INGAME_PLAYER_STATUS.DISCONNECTED)
})

test("connected:true, alive:true는 ALIVE로 계산된다", () => {
  const result = mergeSourcePlayerWithPreview({ id: "u1", name: "A", connected: true, alive: true }, preview())
  assert.equal(result.status, INGAME_PLAYER_STATUS.ALIVE)
})

test("connected:true, alive:false는 DEAD로 계산된다", () => {
  const result = mergeSourcePlayerWithPreview({ id: "u1", name: "A", connected: true, alive: false }, preview())
  assert.equal(result.status, INGAME_PLAYER_STATUS.DEAD)
})

// F-13(AC-05): 계정 프로필 이미지(사진·테두리) — role/team/isAlly와 같은 조건부 복사 관례.
test("입력 player에 accountProfilePhotoId/accountProfileBorderId가 있으면 출력에도 같은 값이 있다", () => {
  const result = mergeSourcePlayerWithPreview(
    {
      id: "u1",
      name: "A",
      connected: true,
      alive: true,
      accountProfilePhotoId: "player-profile-금빛가면",
      accountProfileBorderId: "profile-border-귀족",
    },
    preview(),
  )
  assert.equal(result.accountProfilePhotoId, "player-profile-금빛가면")
  assert.equal(result.accountProfileBorderId, "profile-border-귀족")
})

test("입력 player에 accountProfilePhotoId/accountProfileBorderId 키 자체가 없으면 출력에도 키가 없다(preview 기본 초상 유지)", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(result, "accountProfilePhotoId"), false)
  assert.equal(Object.hasOwn(result, "accountProfileBorderId"), false)
})

test("유효한 accountProfilePhotoId가 있으면 preview의 더미 portraitSrc 대신 실제 계정 사진으로 바뀐다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountProfilePhotoId: "player-profile-기사" },
    preview(),
  )
  assert.equal(result.portraitSrc, "/shopItem/player-profile/프로필-기사.png".normalize("NFD"))
})

test("accountProfileBorderId가 있어도 frameSrc는 건드리지 않는다(직업 스킨/카드 프레임 소유 유지)", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountProfileBorderId: "profile-border-귀족" },
    preview(),
  )
  assert.equal(result.frameSrc, "f.png", "인게임 카드의 frameSrc는 계정 테두리가 아니라 스킨 소유다")
})

test("accountProfilePhotoId가 알 수 없는(카탈로그 규칙과 다른) 값이면 preview의 더미 portraitSrc를 그대로 둔다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountProfilePhotoId: "../../../etc/passwd" },
    preview(),
  )
  assert.equal(result.portraitSrc, "p.png")
})

// F-13 AC-05 재검토: 계정 테두리는 frameSrc(직업 스킨/카드 프레임)와 겹쳐 쓰지 않고
// 별도 필드 accountBorderSrc로만 노출한다 — InGamePlayerCard가 이 필드로 별도 레이어를
// 그린다(frameSrc 자체는 위 "accountProfileBorderId가 있어도 frameSrc는 건드리지 않는다"
// 테스트가 이미 고정한다).
test("유효한 accountProfileBorderId가 있으면 출력에 accountBorderSrc가 실제 테두리 자산으로 채워진다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountProfileBorderId: "profile-border-귀족" },
    preview(),
  )
  assert.equal(result.accountBorderSrc, "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"))
})

test("accountProfileBorderId 키 자체가 없으면 accountBorderSrc 키도 생기지 않는다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(result, "accountBorderSrc"), false)
})

test("accountProfileBorderId가 알 수 없는(카탈로그 규칙과 다른) 값이면 accountBorderSrc 키가 생기지 않는다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountProfileBorderId: "../../../etc/passwd" },
    preview(),
  )
  assert.equal(Object.hasOwn(result, "accountBorderSrc"), false)
})

// ── F-14(AC-01/AC-04): 장착한 플레이어 카드 프레임(accountCardFrameId) ─────────────────

test("유효한 accountCardFrameId가 있으면 preview의 더미 frameSrc 대신 실제 장착 카드 프레임으로 바뀐다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountCardFrameId: "player-card-왕관" },
    preview(),
  )
  assert.equal(result.frameSrc, "/shopItem/player-card/playerframe-alive/인게임-플레이어프레임(왕관).png".normalize("NFC"))
  assert.equal(result.accountCardFrameId, "player-card-왕관")
})

test("accountCardFrameId 키 자체가 없으면 preview의 더미 frameSrc가 그대로 유지되고 accountCardFrameId 키도 생기지 않는다", () => {
  const source = preview()
  const result = mergeSourcePlayerWithPreview({ id: "u1", name: "A", connected: true, alive: true }, source)
  assert.equal(result.frameSrc, source.frameSrc)
  assert.equal(Object.hasOwn(result, "accountCardFrameId"), false)
})

test("accountCardFrameId가 알 수 없는(카탈로그 규칙과 다른) 값이면 preview의 더미 frameSrc를 그대로 둔다", () => {
  const source = preview()
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountCardFrameId: "../../../etc/passwd" },
    source,
  )
  assert.equal(result.frameSrc, source.frameSrc)
})

test("accountCardFrameId가 있어도 portraitSrc·accountBorderSrc는 각자 독립적으로 해석된다(서로 종속되지 않음)", () => {
  const result = mergeSourcePlayerWithPreview(
    {
      id: "u1", name: "A", connected: true, alive: true,
      accountProfilePhotoId: "player-profile-기사",
      accountProfileBorderId: "profile-border-귀족",
      accountCardFrameId: "player-card-사슬",
    },
    preview(),
  )
  assert.equal(result.portraitSrc, "/shopItem/player-profile/프로필-기사.png".normalize("NFD"))
  assert.equal(result.accountBorderSrc, "/shopItem/player- profileborder/프로필프레임-귀족.png".normalize("NFD"))
  assert.equal(result.frameSrc, "/shopItem/player-card/playerframe-alive/인게임-플레이어프레임(사슬).png".normalize("NFC"))
})

// ── CO S-1(AC-05): 계정 전적(총 판수·승률) ──────────────────────────────────────

test("계정 전적이 있으면 그대로 복사된다(0판 0%도 서버가 말한 사실이므로 옮긴다)", () => {
  const withRecord = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, accountTotalGames: 3, accountWinRate: 67 },
    preview(),
  )
  assert.equal(withRecord.accountTotalGames, 3)
  assert.equal(withRecord.accountWinRate, 67)

  const zeroRecord = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true, accountTotalGames: 0, accountWinRate: 0 },
    preview(),
  )
  assert.equal(Object.hasOwn(zeroRecord, "accountTotalGames"), true, "0을 누락으로 취급하면 안 된다")
  assert.equal(zeroRecord.accountTotalGames, 0)
  assert.equal(zeroRecord.accountWinRate, 0)
})

test("계정 전적 키가 없으면 출력에도 키가 생기지 않고, 상속된 값도 복사하지 않는다", () => {
  const missing = mergeSourcePlayerWithPreview(
    { id: "u3", name: "C", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(missing, "accountTotalGames"), false)
  assert.equal(Object.hasOwn(missing, "accountWinRate"), false)

  const inherited = Object.create({ accountTotalGames: 99, accountWinRate: 99 })
  Object.assign(inherited, { id: "u4", name: "D", connected: true, alive: true })
  const fromPrototype = mergeSourcePlayerWithPreview(inherited, preview())
  assert.equal(Object.hasOwn(fromPrototype, "accountTotalGames"), false)
  assert.equal(Object.hasOwn(fromPrototype, "accountWinRate"), false)
})

test("계정 전적이 붙어도 기존 프로필·테마·역할 처리는 그대로다", () => {
  const source = preview()
  const result = mergeSourcePlayerWithPreview(
    {
      id: "u1", name: "A", connected: true, alive: true, themeIndex: 4, role: "JOKER", team: "JOKER",
      accountProfilePhotoId: "player-profile-기사",
      accountTotalGames: 3, accountWinRate: 67,
    },
    source,
  )
  assert.equal(result.role, "JOKER")
  assert.equal(result.team, "JOKER")
  assert.equal(result.themeIndex, 4)
  assert.equal(result.portraitSrc, "/shopItem/player-profile/프로필-기사.png".normalize("NFD"))
  assert.equal(result.status, INGAME_PLAYER_STATUS.ALIVE)
  assert.equal(result.accountTotalGames, 3)
})
