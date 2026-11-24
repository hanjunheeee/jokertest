// 카드 판 칸 이름: 닉네임 + 같은 직업 동료 글 + 상태 (화면 읽기에서 죽음·끊김·나·동료를 알게)
// board/CardSlot이 씀, 순수 함수라 tests/talk에서 바로 시험

// 상태 값은 데스크톱 INGAME_PLAYER_STATUS와 같음
const STATUS_WORD = { dead: "사망", disconnected: "연결 끊김" }

// ally: 같은 직업 동료면 "동료 의사" 같은 글 (내 화면에만 옴), 예: ("민수", "dead", false, "동료 의사") → "민수 · 동료 의사, 사망"
export function slotLabel(nickname, status, isSelf = false, ally = null) {
    const parts = [ally && nickname ? `${nickname} · ${ally}` : nickname ?? ""]
    if (isSelf) parts.push("나")
    if (STATUS_WORD[status]) parts.push(STATUS_WORD[status])
    return parts.filter(Boolean).join(", ")
}
