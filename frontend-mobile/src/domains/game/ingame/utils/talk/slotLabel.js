// 초상 띠·카드 판 칸 이름: 닉네임 + 상태 (화면 읽기에서 죽음·끊김·나를 알게)
// talk/StripSlot·board/CardSlot이 씀, 순수 함수라 tests/talk에서 바로 시험

// 상태 값은 데스크톱 INGAME_PLAYER_STATUS와 같음
const STATUS_WORD = { dead: "사망", disconnected: "연결 끊김" }

export function slotLabel(nickname, status, isSelf = false) {
    const parts = [nickname ?? ""]
    if (isSelf) parts.push("나")
    if (STATUS_WORD[status]) parts.push(STATUS_WORD[status])
    return parts.filter(Boolean).join(", ")
}
