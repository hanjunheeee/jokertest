// 모바일 카톡형 채팅방·설정 시트 시험: 말 줄 좌우(내 말 오른쪽·남의 말 왼쪽)·같은 사람 묶음(이름 한 번)·이모티콘 줄·새 메시지 단추, 설정 시트 탭(채팅·사운드만)·방 코드 보기
// 목록 A06 모바일 A06-M-601~606 (돌리기: frontend-mobile 폴더에서 node --test tests/a06-m6-talk-settings.test.js)
// 채팅방 = TalkLayout·TalkList·TalkBubble (폰 세로), 말은 서버 day_chat_message_received 모양으로 넣음
import "./helpers/mobileLoader.mjs"
import { React, render, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { GAME, NAMES, fakeSocket, fire, renderPage, resetGame, seat, useInGameStore, uuidOf } from "./a00-game.mjs"

const { buildTalkFeed, startsGroup } = await import("@m/domains/game/ingame/utils/talk/buildTalkFeed.js")
const { default: TalkBubble } = await import("@m/domains/game/ingame/components/talk/TalkBubble.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

const talkLog = () => document.querySelector('[data-talk-list] [role="log"]')
const talkLines = (kind) => [...(talkLog()?.querySelectorAll(`li[data-talk-line="${kind}"]`) ?? [])]
// 말 줄 안 이름 줄 (묶음 첫 줄만 있음) → 이름 글 목록
const namesShown = () => [...(talkLog()?.querySelectorAll("li[data-talk-line] p") ?? [])]
    .map((p) => textOf(p)).filter((text) => NAMES.includes(text))

// 6명 판 1일 낮 토론 (나는 0번 자리)
async function dayPage() {
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
    view = await renderPage(socket)
    return socket
}
// 서버 낮 채팅 한 줄 (보낸 자리 who, 글 text, 순번 seq)
let seq = 0
async function say(socket, who, text) {
    seq += 1
    await fire(socket, "day_chat_message_received", {
        gameId: GAME, senderUuid: uuidOf(who), messageId: `msg-${seq}`, nickname: NAMES[who], text, sentAt: 1_700_000_000_000 + seq * 1_000, dayIndex: 1,
    })
}

test("A06-M-601 말 줄 좌우 (6명 판 낮): 남(2번)의 말 → 왼쪽 줄(data-talk-line=other)·이름 '다솜', 내 말 → 오른쪽 줄(mine)", async () => {
    const socket = await dayPage()
    await say(socket, 2, "안녕하세요")
    await say(socket, 0, "반가워요")
    const other = talkLines("other")
    const mine = talkLines("mine")
    assert.equal(other.length, 1, `남의 말 줄 수: ${textOf(talkLog())}`)
    assert.equal(mine.length, 1, `내 말 줄 수: ${textOf(talkLog())}`)
    assert.ok(textOf(other[0]).includes("안녕하세요") && textOf(other[0]).includes(NAMES[2]), `남의 줄: ${textOf(other[0])}`)
    assert.ok(textOf(mine[0]).includes("반가워요"), `내 줄: ${textOf(mine[0])}`)
    assert.match(mine[0].className, /\bjustify-end\b/, "내 말 줄이 오른쪽 정렬이 아님")
    assert.doesNotMatch(other[0].className, /\bjustify-end\b/, "남의 말 줄이 오른쪽 정렬")
})

test("A06-M-602 같은 사람 묶음 (6명 판 낮): 3번이 잇달아 두 줄 → 이름 한 번만, 4번이 끼면 다시 이름", async () => {
    const socket = await dayPage()
    await say(socket, 3, "첫 줄")
    await say(socket, 3, "둘째 줄")
    assert.deepEqual(namesShown(), [NAMES[3]])
    await say(socket, 4, "끼어듦")
    await say(socket, 3, "셋째 줄")
    assert.deepEqual(namesShown(), [NAMES[3], NAMES[4], NAMES[3]])
    assert.equal(talkLines("other").length, 4)
})

test("A06-M-603 이모티콘 줄: 받은 이모티콘(사랑) → 말풍선 대신 그림 칸(data-talk-emoji)·그림 이름 '사랑', 알림 줄 뒤엔 새 묶음", () => {
    const lines = buildTalkFeed({
        notices: [{ id: "n1", at: 1_000, text: `${NAMES[3]}님이 죽었습니다` }],
        emojis: [{ id: "e1", at: 2_000, playerId: "p4", itemId: "emoji-basic-love" }],
        localPlayerId: "p0",
        nameOf: (id) => NAMES[Number(id.slice(1))],
    })
    const emojiLine = lines.find((line) => line.kind === "emoji")
    assert.deepEqual({ name: emojiLine.name, mine: emojiLine.mine }, { name: NAMES[4], mine: false })
    assert.equal(startsGroup(emojiLine, lines[0]), true, "알림 줄 뒤 이모티콘 줄이 새 묶음이 아님")
    const drawn = render(React.createElement("ul", null, React.createElement(TalkBubble, { line: emojiLine, groupStart: true, player: null, themeColor: null, showTime: false })))
    try {
        const emoji = drawn.container.querySelector("[data-talk-emoji]")
        assert.equal(emoji?.getAttribute("data-talk-emoji"), "emoji-basic-love")
        assert.equal(emoji.querySelector("img")?.getAttribute("alt"), "사랑")
        assert.equal(drawn.container.querySelectorAll("li[data-talk-line] p").length, 1, "이모티콘 줄에 말풍선 글이 있음 (이름 줄만 있어야 함)")
    } finally {
        drawn.unmount()
    }
})

// jsdom은 칸 높이가 0 → 스크롤 칸에 높이·위치 값을 붙여 사람이 위로 올려 읽는 중인 것처럼 만듦
function scrollUpToRead(el) {
    let top = 0
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 1_000 })
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 200 })
    Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: (value) => { top = value } })
    // 처음 스크롤: 칸 높이가 바뀐 것으로 보여 맨 아래에 다시 붙음 → 다음 스크롤에서 위로 올림
    act(() => { top = 300; el.dispatchEvent(new window.Event("scroll")) })
    act(() => { top = 100; el.dispatchEvent(new window.Event("scroll")) })
}

test("A06-M-604 새 메시지 단추 (6명 판 낮): 위로 올려 읽는 중 새 말 → '새 메시지 ↓' 단추, 누르면 맨 아래로·단추 사라짐", async () => {
    const socket = await dayPage()
    await say(socket, 1, "첫 말")
    const scroller = talkLog().parentElement
    scrollUpToRead(scroller)
    assert.equal(buttonNamed("새 메시지 ↓"), null, "새 말 전에 단추가 뜸")
    await say(socket, 2, "새 말")
    const newButton = buttonNamed("새 메시지 ↓")
    assert.ok(newButton, "위로 올려 읽는 중 새 말이 왔는데 단추가 없음")
    click(newButton)
    await flush()
    assert.equal(scroller.scrollTop, 1_000, "맨 아래로 안 내려감")
    assert.equal(buttonNamed("새 메시지 ↓"), null, "누른 뒤에도 단추가 남음")
})

test("A06-M-605 설정 시트 탭 (6명 판, 나는 방장): 위 줄 '인게임 설정' → 제목 '설정', 탭 '채팅'·'사운드' 두 개만(방관리 없음), '사운드' 누르면 그 탭이 눌린 상태", async () => {
    await dayPage()
    click(buttonNamed("인게임 설정"))
    await flush()
    const sheet = document.querySelector('[data-testid="settings-sheet"]')
    assert.ok(sheet, "설정 시트가 안 열림")
    assert.equal(textOf(sheet.querySelector("h2")), "설정")
    const tabs = [...sheet.querySelectorAll('[aria-label="인게임 설정 탭"] [data-testid^="setting-tab-"]')]
    assert.deepEqual(tabs.map((tab) => textOf(tab)), ["채팅", "사운드"])
    assert.ok(!textOf(sheet).includes("방관리"), "방관리 탭 글이 보임")
    click(sheet.querySelector('[data-testid="setting-tab-sound"]'))
    await flush()
    assert.equal(document.querySelector('[data-testid="setting-tab-sound"]').getAttribute("aria-pressed"), "true")
    assert.equal(document.querySelector('[data-testid="setting-tab-chat"]').getAttribute("aria-pressed"), "false")
})

test("A06-M-606 설정 시트 '방 코드 보기' (6명 판, 방 코드 AB12CD) → 방 코드 창 '방코드 AB12CD', 닫기 → 방 코드 창만 닫히고 설정 시트 남음", async () => {
    await dayPage()
    act(() => { useInGameStore.setState((store) => ({ state: { ...store.state, roomCode: "AB12CD" } })) })
    await flush()
    click(buttonNamed("인게임 설정"))
    await flush()
    click(document.querySelector('[data-testid="setting-room-code"]'))
    await flush()
    const codeSheet = document.querySelector('[data-testid="room-code-sheet"]')
    assert.ok(codeSheet, "방 코드 창이 안 열림")
    assert.ok(codeSheet.querySelector('[aria-label="방코드 AB12CD"]'), `방 코드 칸: ${textOf(codeSheet)}`)
    click(buttonNamed("방코드 팝업 닫기", codeSheet))
    await flush()
    await waitUntil(() => document.querySelector('[data-testid="room-code-sheet"]') === null, { label: "방 코드 창 닫힘" })
    assert.ok(document.querySelector('[data-testid="settings-sheet"]'), "방 코드 창을 닫자 설정 시트도 닫힘")
})
