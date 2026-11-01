// 모바일 채팅 공통 모양: 데스크톱 채팅 틀 그림을 목록 칸·입력 줄로 잘라 쓰는 자리 값과 글자 모양
// components/chat 아래 부품들이 씀, 글자색·굵기·자간은 데스크톱 채팅 글(ingameChatLayout)과 같음

// 데스크톱 틀 그림(인게임-채팅창프레임2.png, 813x585) 세로 기준 줄 (px)
// 33까지 위 나무, 457~477 가운데 나무 띠, 477~556 입력 띠 양피지, 그 아래 아래 나무
const FRAME_H = 585
const PARCHMENT_TOP = 33
const DIVIDER_TOP = 457
const DIVIDER_BOTTOM = 477
const SIDE_WOOD_RATIO = 62 / 813

// 틀 그림 한 장에서 잘라 보일 구간 (top: 그 구간 시작, end: 끝)
export const FRAME_SLICE = Object.freeze({
    // 목록만 있는 칸 (세로 폰): 가운데 나무 띠까지 → 띠가 칸 아래 테두리
    listWithDivider: { start: 0, end: DIVIDER_BOTTOM },
    // 목록 + 입력 줄 붙는 칸 (넓은 배치·크게 보기): 띠는 입력 줄이 그림
    list: { start: 0, end: DIVIDER_TOP },
    // 입력 줄: 가운데 띠부터 그림 끝까지
    composer: { start: DIVIDER_TOP, end: FRAME_H },
})

// 구간 → 그림 높이·위치 style (칸 높이에 맞춰 늘림, 가로는 칸 너비 그대로라 데스크톱 object-fill과 같음)
export function frameSliceStyle({ start, end }) {
    const span = end - start
    return {
        height: `${(FRAME_H / span) * 100}%`,
        top: `${(-start / span) * 100}%`,
    }
}

// 목록 칸 안쪽 자리 (틀 나무 안쪽, 위·옆 나무 두께 비율)
export function listInsetStyle(slice) {
    const span = slice.end - slice.start
    const bottomWood = slice.end - Math.min(slice.end, DIVIDER_TOP)
    return {
        top: `${(PARCHMENT_TOP / span) * 100 + 1}%`,
        bottom: `${(bottomWood / span) * 100 + 0.8}%`,
        left: `${SIDE_WOOD_RATIO * 100 + 2.2}%`,
        right: `${SIDE_WOOD_RATIO * 100 + 0.8}%`,
    }
}

// 가운데 나무 띠 자리 (상태 줄을 띠 위에 얹음, 데스크톱도 상태 줄이 띠 위)
export function dividerStyle(slice) {
    const span = slice.end - slice.start
    const top = ((DIVIDER_TOP - slice.start) / span) * 100
    const height = ((DIVIDER_BOTTOM - DIVIDER_TOP) / span) * 100
    return { top: `${top}%`, height: `${height}%` }
}

// 채팅 틀 바탕 (그림 밖으로 안 넘치게 자름)
export const FRAME_ROOT_CLASS = "relative w-full overflow-hidden [container-type:inline-size]"

// 잘라 쓰는 틀 그림
export const FRAME_IMAGE_CLASS = "pointer-events-none absolute left-0 w-full max-w-none select-none object-fill"

// 입력 줄 높이·안쪽 여백 (입력 띠 양피지 79px 비율 → 입력칸 44px가 띠 안에 들어감)
export const COMPOSER_BAR_CLASS =
    "relative h-[75px] w-full shrink-0 overflow-hidden transition-transform duration-150 ease-out"

export const COMPOSER_ROW_CLASS =
    "absolute inset-x-[7.6%] top-[16%] bottom-[23%] flex items-center gap-[clamp(0.15rem,1cqi,0.35rem)] pl-[clamp(0.6rem,4cqi,1.4rem)]"

// 메시지 글 모양 (데스크톱 TEXT_TYPOGRAPHY_CLASS에서 글자 크기만 뺌, 크기는 chatFontSize)
export const TEXT_CLASS = "font-subheading font-bold leading-[1.35] tracking-[0.04em] text-[#3a1a0c]"

// 입력칸: 데스크톱처럼 투명 바탕·테두리 없음, 높이 고정 한 줄(넘치면 안에서 스크롤), 글자 16px 이상은 index.css가 맞춤
export const TEXTAREA_CLASS =
    `block h-11 w-full resize-none overflow-y-auto border-0 bg-transparent p-0 py-[0.7rem] outline-none placeholder:text-[#4a2814] placeholder:opacity-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${TEXT_CLASS}`

// 아이콘 버튼 (누르는 자리 44px)
export const ICON_BTN_CLASS =
    "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform duration-200 ease-out active:scale-[0.99]"

// 글자 크기: 데스크톱 배율(0.6~1) × 데스크톱 최대 크기, 폰에서 읽을 수 있게 바닥만 둠
export function chatFontSize(textScale, base = 0.92) {
    const rem = Math.max(0.7, base * textScale)
    return `calc(${rem.toFixed(3)}rem * var(--app-text-scale, 1))`
}
