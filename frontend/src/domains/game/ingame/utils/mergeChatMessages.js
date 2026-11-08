// 채팅 목록 여러 개를 보낸 시각 순 하나로 (같은 시각은 넣은 순서 그대로)
// 낮·죽은 사람 채팅 세션 훅·채팅 틀 속성 훅이 씀 (죽은 사람이 낮 채팅·죽은 사람 채팅을 같이 볼 때)

// 시각이 이상하면 맨 뒤로
function sortKey(sentAt) {
  return Number.isFinite(sentAt) ? sentAt : Number.POSITIVE_INFINITY
}

// 예: [{sentAt:1}], [{sentAt:0},{sentAt:2}] → [{sentAt:0},{sentAt:1},{sentAt:2}]
export function mergeChatMessagesByTime(...lists) {
  const merged = lists.flatMap((list) => (Array.isArray(list) ? list : []))
  return merged
    .map((message, index) => ({ message, index }))
    .sort((a, b) => sortKey(a.message?.sentAt) - sortKey(b.message?.sentAt) || a.index - b.index)
    .map(({ message }) => message)
}
