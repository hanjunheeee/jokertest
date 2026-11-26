// 카드 판 칸 이름: 닉네임(동료면 "닉네임 · 동료 직업") + 상태 (화면 읽기에서 동료·죽음·끊김·나를 알게)
// board/CardSlot이 씀, 순수 함수라 단위 시험에서 바로 검증
const STATUS_WORD = { dead: "사망", disconnected: "연결 끊김" }

// 예: slotLabel("나래", "alive", false, "동료 광대") → "나래 · 동료 광대"
export function slotLabel(nickname, status, isSelf = false, allyLabel = null) {
    const baseName = nickname ?? ""
    const head = baseName && allyLabel && !isSelf ? `${baseName} · ${allyLabel}` : baseName
    const parts = [head]
    if (isSelf) parts.push("나")
    if (STATUS_WORD[status]) parts.push(STATUS_WORD[status])
    return parts.filter(Boolean).join(", ")
}
