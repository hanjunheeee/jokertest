// 6차 묶음: 친구 목록 거르기·묶기·폴더 이름, 늦은 응답 위에 로컬 변경 얹기, 게임 초대 줄 계산
import test from "node:test"
import assert from "node:assert/strict"

import { filterFriendListItems, mergeFriendGroups } from "../../src/domains/lobby/utils/filterFriendListItems.js"
import {
  applyFriendFavoriteFlags,
  filterVisibleFriendCandidates,
  groupFriends,
} from "../../src/domains/lobby/utils/friendList.js"
import {
  countOnlineFriends,
  getFavoriteFriendLabel,
  getNormalFriendLabel,
  getOfflineFriendLabel,
} from "../../src/domains/lobby/utils/friendListGroupLabels.js"
import { applyFavoriteWrites, newerRemovals } from "../../src/domains/lobby/utils/friend/pendingWrites.js"
import {
  compareSeq,
  isActionable,
  isTerminalRefusal,
  isUsable,
  merge,
  selectPending,
  survives,
} from "../../src/domains/lobby/utils/gameInvite/invites.js"

const friends = [
  { id: "f1", name: "Alice", online: true },
  { id: "f2", name: "bob", online: false },
  { id: "f3", name: "앨리스", online: true },
]

test("친구 거르기: 검색어는 앞뒤 공백 빼고 대소문자 안 가림", () => {
  assert.deepEqual(filterFriendListItems(friends, "  ALI ", ["name"]).map((f) => f.id), ["f1"])
})

test("친구 거르기: 빈 검색어면 같은 목록 그대로", () => {
  assert.equal(filterFriendListItems(friends, "   ", ["name"]), friends)
})

test("친구 거르기: 여러 칸 중 하나라도 맞으면 남고, 빈 칸은 건너뜀", () => {
  const items = [{ id: "abc", name: null }, { id: "x", name: "abc님" }, { id: "y", name: "z" }]
  assert.deepEqual(filterFriendListItems(items, "abc", ["name", "id"]).map((i) => i.id), ["abc", "x"])
})

test("친구 묶음 합치기: 접속·오프라인·즐겨찾기 순서", () => {
  assert.deepEqual(
    mergeFriendGroups({ onlineFriends: [1], offlineFriends: [2], favoriteFriends: [3] }),
    [1, 2, 3],
  )
})

test("친구 묶기: 즐겨찾기는 접속·오프라인 묶음에서 빠짐", () => {
  const flagged = applyFriendFavoriteFlags(friends, new Set(["f3"]))
  const g = groupFriends(flagged)
  assert.deepEqual(g.onlineFriends.map((f) => f.id), ["f1"])
  assert.deepEqual(g.offlineFriends.map((f) => f.id), ["f2"])
  assert.deepEqual(g.favoriteFriends.map((f) => f.id), ["f3"])
})

test("친구 검색 후보: 이미 응답 끝난 신청 대상은 뺌", () => {
  assert.deepEqual(filterVisibleFriendCandidates([{ id: "a" }, { id: "b" }], new Set(["a"])), [{ id: "b" }])
})

test("친구 폴더 이름: online 칸이나 status ONLINE을 접속으로 셈", () => {
  const list = [{ online: true }, { status: "ONLINE" }, { online: false }]
  assert.equal(countOnlineFriends(list), 2)
  assert.equal(getNormalFriendLabel(list, 5), "일반 (2/5)")
  assert.equal(getNormalFriendLabel(list), "일반 (2/3)")
  assert.equal(getOfflineFriendLabel([1, 2]), "오프라인 (2)")
  assert.equal(getFavoriteFriendLabel([]), "즐겨찾기 (0)")
})

test("받은 신청 지움: 응답 번호표보다 뒤에 지운 것만 남김(거절한 줄이 되살아나지 않게)", () => {
  assert.deepEqual(newerRemovals({ a: 3, b: 5, c: 7 }, 5), { c: 7 })
})

test("즐겨찾기 변경: 응답 뒤에 한 변경만 응답 목록 위에 다시 얹음", () => {
  const { next, pending } = applyFavoriteWrites(["a", "b"], {
    a: { seq: 2, favorite: false },
    b: { seq: 9, favorite: false },
    c: { seq: 9, favorite: true },
  }, 5)
  assert.deepEqual([...next].sort(), ["a", "c"])
  assert.deepEqual(Object.keys(pending).sort(), ["b", "c"])
})

test("즐겨찾기 변경: 응답 목록이 배열이 아니면 빈 목록에서 시작", () => {
  assert.deepEqual([...applyFavoriteWrites(null, {}, 0).next], [])
})

test("초대 순번 비교: 큰 숫자 글자를 길이 먼저, 앞자리 0은 무시", () => {
  assert.ok(compareSeq("10", "9") > 0)
  assert.ok(compareSeq("99999999999999999999", "100000000000000000000") < 0)
  assert.equal(compareSeq("007", "7"), 0)
  assert.ok(Number.isNaN(compareSeq("1a", "2")))
  assert.equal(compareSeq(null, "0"), 0)
})

const inv = (extra = {}) => ({ inviteId: "i1", receiverId: "r", status: "PENDING", revision: 1, creationSeq: "5", ...extra })

test("초대 줄 쓸 수 있는지: 필수 칸 빠지면 못 씀", () => {
  assert.equal(isUsable(inv()), true)
  assert.equal(isUsable(inv({ revision: "1" })), false)
  assert.equal(isUsable(inv({ creationSeq: "5a" })), false)
  assert.equal(isUsable(inv({ receiverId: "" })), false)
  assert.equal(isUsable([]), false)
})

test("초대 합치기: 같은 초대는 revision 같거나 큰 쪽이 덮고 새 순번부터 정렬", () => {
  const out = merge(
    [inv({ revision: 2, status: "PENDING" }), inv({ inviteId: "i2", creationSeq: "9" })],
    [inv({ revision: 1, status: "ACCEPTED" }), inv({ inviteId: "i3", creationSeq: "7" }), { inviteId: "bad" }],
  )
  assert.deepEqual(out.map((i) => i.inviteId), ["i2", "i3", "i1"])
  assert.equal(out.find((i) => i.inviteId === "i1").status, "PENDING")
})

test("스냅샷 뒤 남길 줄: 스냅샷에 있음·끝난 줄·커서보다 새 줄만", () => {
  assert.equal(survives(inv(), new Set(["i1"]), "10"), true)
  assert.equal(survives(inv({ status: "DECLINED" }), new Set(), "10"), true)
  assert.equal(survives(inv({ creationSeq: "11" }), new Set(), "10"), true)
  assert.equal(survives(inv({ creationSeq: "10" }), new Set(), "10"), false)
})

test("실시간 대기 초대 받기: 스냅샷이 끝난 걸로 본 옛 줄은 막음", () => {
  assert.equal(isActionable(inv({ creationSeq: "3" }), new Set(), "5", true), false)
  assert.equal(isActionable(inv({ creationSeq: "3" }), new Set(), "5", false), true)
  assert.equal(isActionable(inv({ creationSeq: "3" }), new Set(["i1"]), "5", true), true)
  assert.equal(isActionable(inv({ creationSeq: "6" }), new Set(), "5", true), true)
})

test("초대 거절 확정: 4xx만, 408·425·429는 다시 보낼 수 있어 뺌", () => {
  assert.equal(isTerminalRefusal(403), true)
  assert.equal(isTerminalRefusal(409), true)
  for (const s of [408, 425, 429, 500, 200, "404"]) assert.equal(isTerminalRefusal(s), false, String(s))
})

test("대기 초대 보이기: 대기 상태이고 아직 안 지난 것만(만료 시각 없으면 보임)", () => {
  const now = Date.parse("2026-11-09T00:00:00Z")
  const list = [
    inv({ inviteId: "a", expiresAt: "2026-11-09T00:00:10Z" }),
    inv({ inviteId: "b", expiresAt: "2026-11-08T23:59:59Z" }),
    inv({ inviteId: "c" }),
    inv({ inviteId: "d", status: "ACCEPTED" }),
  ]
  assert.deepEqual(selectPending(list, now).map((i) => i.inviteId), ["a", "c"])
})
