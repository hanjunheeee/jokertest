// 카톡형 채팅방 공통 모양: 말풍선 색(남·나·조커·죽은 사람), 글자 모양, 초상 크기
// components/talk 아래 부품들이 씀, 색은 지금 그림(양피지·금빛·어두운 나무)에서 고름

// 말풍선 바탕 (꼬리 쪽 모서리만 덜 둥글게)
// max-w + overflow-wrap:anywhere: 공백 없는 긴 영문도 줄바꿈 (데스크톱 TEXT_WRAP_CLASS와 같음)
const BUBBLE_BASE =
    "min-w-0 w-fit max-w-[min(100%,17.5rem)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-3 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.45)]"

export const BUBBLE_CLASS = {
    other: `${BUBBLE_BASE} rounded-2xl rounded-tl-sm border border-[#c9a66b]/60 bg-[#efe2c4] text-[#3a1a0c]`,
    mine: `${BUBBLE_BASE} rounded-2xl rounded-tr-sm border border-[#a8823e]/70 bg-[#d9b46a] text-[#2a1206]`,
    jokerOther: `${BUBBLE_BASE} rounded-2xl rounded-tl-sm border border-[#a33a2a]/70 bg-[#4a1414] text-[#f6dcc8]`,
    jokerMine: `${BUBBLE_BASE} rounded-2xl rounded-tr-sm border border-[#c2503c]/70 bg-[#7a2418] text-[#ffe6d6]`,
    // 죽은 사람끼리 말: 회색 (산 사람 말과 구분)
    deadOther: `${BUBBLE_BASE} rounded-2xl rounded-tl-sm border border-[#8a8a8a]/60 bg-[#3a3a3a] text-[#dcdcdc]`,
    deadMine: `${BUBBLE_BASE} rounded-2xl rounded-tr-sm border border-[#a0a0a0]/70 bg-[#5a5a5a] text-[#f0f0f0]`,
}

export function bubbleClass(line) {
    if (line.dead) return line.mine ? BUBBLE_CLASS.deadMine : BUBBLE_CLASS.deadOther
    if (line.joker) return line.mine ? BUBBLE_CLASS.jokerMine : BUBBLE_CLASS.jokerOther
    return line.mine ? BUBBLE_CLASS.mine : BUBBLE_CLASS.other
}

// 말풍선 글 (지금 채팅 글과 같은 글꼴, 굵기만 조금 낮춤)
export const BUBBLE_TEXT_CLASS = "font-subheading font-semibold leading-[1.4] tracking-[0.02em]"

// 닉네임·시각 (어두운 바탕 위)
export const NAME_CLASS = "mb-0.5 truncate text-[0.72rem] font-semibold text-[#f3dcb0]"
export const TIME_CLASS = "shrink-0 pb-0.5 text-[0.62rem] tabular-nums text-[#e8d5b0]/60"

// 초상 자리
export const AVATAR_SIZE_CLASS = "h-14 w-14"

// 묶음 이어지는 줄: 가로만 맞추고 세로는 말풍선 높이만 (h-14 빈칸이면 줄마다 아래 여백이 생겨 간격이 벌어짐)
export const AVATAR_WIDTH_SPACER_CLASS = "w-14 shrink-0 self-start"

// 상대 말 줄: 오른쪽 여백 + 왼쪽으로 조금 당김 (내 말 -mr-1과 대칭)
export const OTHER_ROW_CLASS = "pr-8 -ml-1"

// 내 말 줄: 왼쪽 여백 + 오른쪽으로 조금 더 당김 (양피지 틀 안쪽 끝에 맞춤)
export const MINE_ROW_CLASS = "pl-14 pr-0 -mr-1"

// 받은 시각 → 시:분 (이상한 값이면 안 보임)
export function formatTime(at) {
    if (!Number.isFinite(at)) return null
    const date = new Date(at)
    if (Number.isNaN(date.getTime())) return null
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}
