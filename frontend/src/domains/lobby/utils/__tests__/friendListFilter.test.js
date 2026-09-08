import assert from "node:assert/strict"
import test from "node:test"
import { FRIEND_LIST_FILTER_FIELDS } from "../../constants/friendListFilter.js"
import { filterFriendListItems, mergeFriendGroups } from "../filterFriendListItems.js"

const FRIENDS = [
  { id: "f-1", name: "가면술사" },
  { id: "f-2", name: "Harlequin" },
  { id: "f-3", name: "광대" },
]

test("검색어가 비어 있으면 항목 전체가 그대로 표시된다", () => {
  const shown = filterFriendListItems(FRIENDS, "", FRIEND_LIST_FILTER_FIELDS.friend)

  assert.deepEqual(shown.map((friend) => friend.id), ["f-1", "f-2", "f-3"])
})

test("검색어에 따라 표시되는 친구가 달라진다", () => {
  const shownForGwang = filterFriendListItems(FRIENDS, "광대", FRIEND_LIST_FILTER_FIELDS.friend)
  const shownForHarle = filterFriendListItems(FRIENDS, "harle", FRIEND_LIST_FILTER_FIELDS.friend)

  assert.deepEqual(shownForGwang.map((friend) => friend.id), ["f-3"])

  // 대소문자가 달라도 같은 결과가 나와야 합니다.
  assert.deepEqual(shownForHarle.map((friend) => friend.id), ["f-2"])

  // 검색어가 달라지면 표시 항목도 달라집니다.
  assert.notDeepEqual(shownForGwang, shownForHarle)
})

test("맞는 항목이 없으면 빈 목록이 된다", () => {
  const shown = filterFriendListItems(FRIENDS, "없는이름", FRIEND_LIST_FILTER_FIELDS.friend)

  assert.deepEqual(shown, [])
})

test("받은 요청은 닉네임뿐 아니라 id로도 걸러진다", () => {
  const requests = [
    { id: "user-77", name: "익명" },
    { id: "user-88", name: "가면" },
  ]

  const byId = filterFriendListItems(requests, "77", FRIEND_LIST_FILTER_FIELDS.incomingRequest)
  const byName = filterFriendListItems(requests, "가면", FRIEND_LIST_FILTER_FIELDS.incomingRequest)

  assert.deepEqual(byId.map((request) => request.id), ["user-77"])
  assert.deepEqual(byName.map((request) => request.id), ["user-88"])
})

test("mergeFriendGroups는 세 그룹을 하나의 검색 대상 목록으로 합친다", () => {
  const merged = mergeFriendGroups({
    onlineFriends: [{ id: "f-1" }],
    offlineFriends: [{ id: "f-2" }],
    favoriteFriends: [{ id: "f-3" }],
  })

  assert.deepEqual(merged.map((friend) => friend.id), ["f-1", "f-2", "f-3"])
})
