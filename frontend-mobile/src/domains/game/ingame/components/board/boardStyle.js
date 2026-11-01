// 카드 판 모양 값: 인원수별 열 수·카드 폭 계산·판/줄/칸 class
// Board·CardSlot이 씀 (폭은 판 폭(cqi)과 화면 높이(svh) 둘 다로 묶음)

// 7~10명은 5열(5×2), 6명 이하는 3열(3×2)
export function boardColumns(count) {
    return count >= 7 ? 5 : 3
}

// 판 바깥: 폭 기준 컨테이너, 카드 상한은 기기별 (가로 폰은 높이 19svh로 묶여 두 줄이 화면에 들어감)
export const BOARD_ROOT_CLASS =
    "relative w-full select-none px-2 pb-1 pt-3 [container-type:inline-size] [--card-gap:0.375rem] [--card-cap:min(5.5rem,19svh)] md:[--card-cap:min(7.5rem,19svh)] lg:[--card-cap:min(8.5rem,19svh)]"

// 판 폭에서 좌우 여백·사이 간격 빼고 열 수로 나눔, 상한 넘지 않음
export const CARD_WIDTH =
    "min(calc((100cqi - 1rem - (var(--cols) - 1) * var(--card-gap)) / var(--cols)), var(--card-cap))"

// 줄 묶음: 모자란 줄(7·9명)도 가운데 맞춤, 폭은 열 수만큼
export const BOARD_ROW_CLASS =
    "mx-auto flex flex-wrap justify-center gap-x-[var(--card-gap)] gap-y-2"

export const BOARD_ROW_STYLE = {
    maxWidth: `calc(var(--cols) * ${CARD_WIDTH} + (var(--cols) - 1) * var(--card-gap))`,
}

// 카드 칸: 누름 자리(44px 이상)·길게 누름 때 iOS 그림 메뉴 막기
export const SLOT_CLASS =
    "relative shrink-0 cursor-pointer touch-manipulation rounded-md border-0 bg-transparent p-0 outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-[#f3d28d] active:scale-[0.97] transition-transform"
