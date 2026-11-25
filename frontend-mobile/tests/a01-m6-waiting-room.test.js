// 모바일 대기방 동작 시험(합친 화면): 준비·준비 해제, 방장 게임시작·시작 중·시작 막힘 창, 방 삭제 양피지 확인, 참가자 나가기, 추방 시트, 친구 초대 시트, 설정 변경 시트, 끝난 판이면 목록으로 안 감
// 목록 A01 모바일 A01-M-601~611, 2026-11-24 되돌린 화면(baa5c898)에 맞춘 새 시험 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-m6-waiting-room.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, router, useAuthStore, useInGameStore } from "./a00-game.mjs"

const { default: GameMatchingPage } = await import("@m/domains/game/matching/pages/GameMatchingPage.jsx")
const { default: ParchmentConfirmHost } = await import("@m/shared/ui/modal/parchment/ParchmentConfirmHost.jsx")
const { installParchmentConfirm, getParchmentConfirmState, resolveParchmentConfirm } = await import("@m/shared/ui/modal/parchment/parchmentConfirm.js")
const { setAppConfirmHandler } = await import("@/shared/utils/appConfirm.js")
const { useMatchingStore } = await import("@/domains/game/matching/store/matchingStore.js")
const { useFriendStore } = await import("@/domains/lobby/store/friend.store.js")
const { useGameInviteStore } = await import("@/domains/lobby/store/gameInvite.store.js")

let view = null
let confirmHost = null
const friendStart = useFriendStore.getState()
const inviteStart = useGameInviteStore.getState()
afterEach(() => {
    confirmHost?.unmount()
    confirmHost = null
    while (getParchmentConfirmState() !== null) resolveParchmentConfirm(false)
    setAppConfirmHandler(null)
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()
    useFriendStore.setState(friendStart, true)
    useGameInviteStore.setState(inviteStart, true)
})

const NAMES = { pA: "가람", pB: "나래", pC: "다솜", pD: "라온", pE: "마루" }

// 서버 방 값 모양 (방장 가람, ids 순서대로 앉음, ready = 준비한 사람 id)
function roomOf({ ids = ["pA", "pB", "pC"], ready = [], canStart = false } = {}) {
    return {
        roomId: "room-m6",
        roomCode: "M6AB12",
        players: ids.map((uuid) => ({ uuid, nickname: NAMES[uuid], isReady: ready.includes(uuid), membershipId: `m-${uuid}` })),
        hostUuid: "pA",
        reservedHostUuid: null,
        roomInstanceId: "inst-m6",
        bootEpoch: "boot-m6",
        canStart,
        accessType: "open",
        settingsVersion: 1,
        settings: { maxPlayers: 8, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
    }
}

// 나중에 주는 답 (주기 전엔 보내는 중 그대로)
function later() {
    let give
    const promise = new Promise((resolve) => { give = resolve })
    return { promise, give }
}

// me 계정으로 대기방을 그림 (acks = 소켓 답 더하기), 방 확인(get_current_room)까지 끝난 뒤 돌아옴
async function openRoom({ me = "pA", room = roomOf(), acks = {}, parchmentConfirm = false } = {}) {
    const socket = fakeSocket({ acks: { get_current_room: { ok: true, room }, ...acks } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: me, nickname: NAMES[me] } })
    useMatchingStore.getState().setRoom(room)
    if (parchmentConfirm) {
        installParchmentConfirm()
        confirmHost = render(React.createElement(ParchmentConfirmHost))
    }
    view = await renderRoute(socket, React.createElement(GameMatchingPage), { path: "/game-matching" })
    await flush(10)
    return socket
}

const elsewhere = () => document.querySelector("[data-elsewhere]")?.getAttribute("data-elsewhere") ?? null
const confirmBox = () => document.querySelector('[data-parchment-confirm] [role="alertdialog"]')
const confirmButton = (label) => [...(confirmBox()?.querySelectorAll("button") ?? [])].find((b) => textOf(b) === label) ?? null

test("A01-M-601 참가자 '준비완료' 누름 → set_ready {isReady:true, roomId, expectedSettingsVersion:1}, 답 오면 단추 '준비취소'", async () => {
    const socket = await openRoom({
        me: "pB",
        acks: { set_ready: { ok: true, roomId: "room-m6", isReady: true, settingsVersion: 1, readyRevision: 1, canStart: false } },
    })
    const ready = buttonNamed("준비완료")
    assert.ok(ready, `단추: ${buttonNames().join(" | ")}`)
    assert.equal(ready.disabled, false, "방 확인 뒤인데 준비 단추가 꺼짐")
    click(ready)
    await flush(5)
    assert.deepEqual(socket.sentOf("set_ready"), [{ isReady: true, roomId: "room-m6", expectedSettingsVersion: 1 }])
    assert.ok(buttonNamed("준비취소"), `단추: ${buttonNames().join(" | ")}`)
    assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "pB").isReady, true)
})

test("A01-M-602 준비한 참가자 '준비취소' 누름 → set_ready {isReady:false}, 답 기다리는 동안 '처리 중'·꺼짐, 답 오면 '준비완료'", async () => {
    const answer = later()
    const socket = await openRoom({ me: "pB", room: roomOf({ ready: ["pA", "pB"] }), acks: { set_ready: () => answer.promise } })
    click(buttonNamed("준비취소"))
    await flush(3)
    assert.equal(socket.sentOf("set_ready")[0]?.isReady, false)
    const pending = buttonNamed("처리 중")
    assert.ok(pending, `단추: ${buttonNames().join(" | ")}`)
    assert.equal(pending.disabled, true)
    await act(async () => { answer.give({ ok: true, roomId: "room-m6", isReady: false, settingsVersion: 1, readyRevision: 2, canStart: false }) })
    await flush(5)
    assert.ok(buttonNamed("준비완료"), `단추: ${buttonNames().join(" | ")}`)
})

test("A01-M-603 3명 방 방장 '게임시작'은 미리 안 꺼짐 → 누르면 start_game 보냄, 답 기다리는 동안 '시작 중'·꺼짐", async () => {
    const answer = later()
    const socket = await openRoom({ acks: { start_game: () => answer.promise } })
    const start = buttonNamed("게임시작")
    assert.ok(start, `단추: ${buttonNames().join(" | ")}`)
    assert.equal(start.disabled, false, "3명인데 미리 꺼짐")
    assert.ok(document.querySelector('[data-testid="start-locked-reason"]') === null)
    click(start)
    await flush(3)
    assert.deepEqual(socket.sentOf("start_game"), [{ roomId: "room-m6", expectedSettingsVersion: 1 }])
    const starting = buttonNamed("시작 중")
    assert.ok(starting, `단추: ${buttonNames().join(" | ")}`)
    assert.equal(starting.disabled, true)
    await act(async () => { answer.give({ ok: false, message: "게임을 시작할 수 없습니다." }) })
    await flush(5)
})

test("A01-M-604 게임시작 서버 거절 → 시작 막힘 창(제목·서버 글), '확인' 누르면 창 닫히고 '게임시작' 다시 켜짐", async () => {
    const refusal = "게임을 시작하기 위한 인원 조건을 만족하지 않습니다."
    await openRoom({ acks: { start_game: { ok: false, code: "NOT_ENOUGH_PLAYERS", message: refusal } } })
    click(buttonNamed("게임시작"))
    await flush(5)
    const box = document.querySelector("[data-game-start-blocked] [role=dialog]")
    assert.ok(box, "시작 막힘 창이 없음")
    assert.match(textOf(box), /게임을 시작할 수 없습니다/)
    assert.equal(textOf(box.querySelector("[role=alert]")), refusal)
    const ok = [...box.querySelectorAll("button")].find((b) => textOf(b) === "확인")
    assert.ok(ok, "확인 단추가 없음")
    click(ok)
    await flush(3)
    assert.ok(document.querySelector("[data-game-start-blocked]") === null, "확인했는데 창이 남음")
    assert.equal(buttonNamed("게임시작").disabled, false)
})

test("A01-M-605 방장 '방 삭제하기' → 양피지 확인 창 글, '취소'면 delete_room 안 보냄, '확인'이면 보내고 방 목록(/multiplay)으로", async () => {
    const socket = await openRoom({ acks: { delete_room: { ok: true } }, parchmentConfirm: true })
    click(buttonNamed("방 삭제하기"))
    await flush(3)
    assert.ok(confirmBox(), "확인 창이 안 뜸")
    assert.equal(confirmBox().querySelector("p").textContent, "방을 삭제하면 모든 참가자가 나가게 됩니다.\n삭제하시겠습니까?")
    click(confirmButton("취소"))
    await flush(3)
    assert.ok(confirmBox() === null, "취소했는데 창이 남음")
    assert.equal(socket.sentOf("delete_room").length, 0, "취소했는데 삭제를 보냄")

    click(buttonNamed("방 삭제하기"))
    await flush(3)
    // 삭제되면 서버 방 자리도 없음 (방을 다시 물어도 없음)
    socket.acks.get_current_room = { ok: true, room: null }
    click(confirmButton("확인"))
    await flush(5)
    assert.equal(socket.sentOf("delete_room").length, 1)
    await waitUntil(() => elsewhere() === "/multiplay", { label: "방 목록으로 이동" })
    assert.equal(useMatchingStore.getState().isInRoom, false, "방 값이 남음")
})

test("A01-M-606 참가자 '방 나가기' → leave_room 보내고 방 목록(/multiplay)으로, 방 값 비움", async () => {
    const socket = await openRoom({ me: "pB" })
    assert.ok(buttonNamed("방 삭제하기") === null, "참가자에게 방 삭제 단추")
    click(buttonNamed("방 나가기"))
    await flush(3)
    assert.equal(socket.sentOf("leave_room").length, 1)
    await waitUntil(() => elsewhere() === "/multiplay", { label: "방 목록으로 이동" })
    assert.equal(useMatchingStore.getState().isInRoom, false)
})

test("A01-M-607 추방 시트: 줄 '추방' 한 번에 kick_room_player 보냄, 답 기다리는 동안 확인 칸(kick-confirm)에 그 이름·꺼진 '추방'·'취소', 그 줄 '보내는 중', 답 ok면 시트 닫힘", async () => {
    const answer = later()
    const socket = await openRoom({ acks: { kick_room_player: () => answer.promise } })
    click(buttonNamed("참가자 추방"))
    await flush(3)
    const sheet = document.querySelector('[data-testid="kick-sheet"]')
    assert.ok(sheet, "추방 시트가 안 열림")
    assert.match(textOf(sheet), /추방을 누르면 확인 없이 바로 내보냅니다\./)
    assert.equal([...sheet.querySelectorAll("li")].length, 2, "추방 대상 줄 수가 다름")
    // 줄 "추방" (이름 순서 = 나래·다솜)
    click([...sheet.querySelectorAll("li")][0].querySelector("button"))
    await flush(3)
    const sent = socket.sentOf("kick_room_player")
    assert.equal(sent.length, 1, "한 번 눌렀는데 추방 요청 수가 다름")
    assert.equal(sent[0].targetUuid, "pB")
    assert.equal(sent[0].targetMembershipId, "m-pB")
    assert.equal(sent[0].roomId, "room-m6")
    // 보내는 동안: 확인 칸이 뜨지만 "추방"은 꺼져 있고 "취소"는 눌러도 아무 일 없음 (공용 훅이 취소 함수를 안 넘김)
    const confirm = document.querySelector('[data-testid="kick-confirm"]')
    assert.ok(confirm, "보내는 동안 확인 칸이 없음")
    assert.equal(textOf(confirm.querySelector('[data-testid="kick-confirm-target"]')), "나래")
    assert.equal(confirm.querySelector('[data-testid="kick-confirm-accept"]').disabled, true)
    const cancel = confirm.querySelector('[data-testid="kick-confirm-cancel"]')
    assert.equal(cancel.disabled, false)
    click(cancel)
    await flush(2)
    assert.ok(document.querySelector('[data-testid="kick-confirm"]'), "취소를 누르니 확인 칸이 사라짐")
    assert.equal(socket.sentOf("kick_room_player").length, 1)
    assert.ok(buttonNamed("추방 보내는 중"), `단추: ${buttonNames(sheet).join(" | ")}`)
    await act(async () => { answer.give({ ok: true }) })
    await flush(5)
    assert.ok(document.querySelector('[data-testid="kick-sheet"]') === null, "추방 성공인데 시트가 남음")
})

test("A01-M-608 친구 초대 시트: 바닥 '친구 초대' → 창 '친구초대', 친구 없음 글 / 친구 줄 '라온 게임 초대' → 보내고 성공하면 '초대중..' 잠김", async () => {
    useFriendStore.setState({ friends: [], friendsError: null, fetchFriends: async () => {} })
    await openRoom()
    click(buttonNamed("친구 초대"))
    await flush(5)
    assert.ok(textOf(document.body).includes("친구초대"), "초대 창 제목이 없음")
    assert.ok(textOf(document.body).includes("초대할 친구가 없습니다."), "친구 없음 글이 없음")
    // 친구가 들어오면 줄과 초대 단추
    const asked = []
    act(() => {
        useFriendStore.setState({ friends: [{ id: "f1", name: "라온", online: true }] })
        useGameInviteStore.setState({ sendInvite: async (friendId, key) => { asked.push([friendId, key]); return { ok: true } } })
    })
    await flush(3)
    click(buttonNamed("라온 게임 초대"))
    await flush(5)
    assert.deepEqual(asked, [["f1", "room-m6:f1"]])
    const inviting = buttonNamed("라온 초대 보내는 중")
    assert.ok(inviting, `단추: ${buttonNames().join(" | ")}`)
    assert.equal(inviting.disabled, true)
    assert.ok(textOf(inviting).includes("초대중.."))
})

test("A01-M-609 설정 변경 시트: 방장 '방 설정 변경' → '설정 저장'·'설정 변경 취소' 화면, 방장 단추 줄은 숨김, 취소하면 닫힘", async () => {
    await openRoom()
    click(buttonNamed("방 설정 변경"))
    await flush(5)
    assert.ok(buttonNamed("설정 저장"), `단추: ${buttonNames().join(" | ")}`)
    assert.ok(buttonNamed("설정 변경 닫기"))
    // 방장 단추 줄(설정 변경·추방)은 자리만 남기고 숨김
    const hostRow = buttonNamed("방 설정 변경").parentElement
    assert.ok(hostRow.classList.contains("invisible"), "설정 중인데 방장 단추 줄이 보임")
    click(buttonNamed("설정 변경 취소"))
    await flush(3)
    assert.ok(buttonNamed("설정 저장") === null, "취소했는데 설정 화면이 남음")
    assert.equal(buttonNamed("방 설정 변경").parentElement.classList.contains("invisible"), false)
})

test("A01-M-610 판이 시작되자마자 끝남(끝난 판 ENDED + 방 비움) → 방 목록으로 안 감, 대기방 주소에서 빈 화면", async () => {
    const socket = await openRoom()
    // 판이 시작되면 서버 방 자리는 비어 있음 (방을 다시 물어도 없음)
    socket.acks.get_current_room = { ok: true, room: null }
    act(() => {
        useInGameStore.setState({ gameId: "g-m6", state: { id: "g-m6", phase: "ENDED", dayIndex: 1, players: [], winResult: { winner: "CITIZEN", reveals: [] } } })
        useMatchingStore.getState().clearRoom()
    })
    await flush(10)
    assert.equal(elsewhere(), null, `다른 화면으로 감: ${elsewhere()}`)
    assert.equal(router.state.location.pathname, "/game-matching")
    assert.ok(buttonNamed("게임시작") === null, "방이 비었는데 대기방 단추가 남음")
})

test("A01-M-611 판 없이 방만 비면 → 방 목록(/multiplay)으로 감", async () => {
    const socket = await openRoom()
    socket.acks.get_current_room = { ok: true, room: null }
    act(() => { useMatchingStore.getState().clearRoom() })
    await waitUntil(() => elsewhere() === "/multiplay", { label: "방 목록으로 이동" })
})
