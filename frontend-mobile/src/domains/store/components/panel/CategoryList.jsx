// 상점 분류 목록 (제목 + 분류 버튼들), 폰 세로는 가로로 미는 한 줄·가로·태블릿은 데스크톱처럼 오른쪽 세로 목록
// panel/StorePanel이 씀
// 고른 분류를 다시 누르면 풀려서 전체 상품 (데스크톱 useStoreCategoryFilter 동작 그대로)
import {
    CATEGORY_ROW_SELECTED_CLASS,
    SIDEBAR_HEADER_CLASS,
    SIDEBAR_HEADER_WRAP_CLASS,
} from "@/domains/store/constants/storeLayoutStyle.js"

// 데스크톱 CATEGORY_ROW_CLASS 색·글자, 폭·높이만 폰 손가락에 맞춤 (그 상수의 w-full은 가로 줄에 안 맞음)
const ROW_CLASS =
    "min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-sm border-0 px-3 text-left font-subheading app-text-scaled [--app-text-size:0.98rem] font-bold leading-snug transition-[background-color,color] md:w-full land:w-full"

const ROW_IDLE_CLASS = "bg-[#1a0f0a]/06 text-[#2a1810]/90 active:bg-[#1a0f0a]/10"

// 분류 한 줄 버튼, 고른 분류는 눌린 상태로 보임
function CategoryRow({ label, selected, onSelect }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`${ROW_CLASS} ${selected ? CATEGORY_ROW_SELECTED_CLASS : ROW_IDLE_CLASS}`}
            style={{ outline: "none" }}
            aria-pressed={selected}
        >
            {label}
        </button>
    )
}

// 제목 '카테고리'는 세로 목록일 때만 보임 (폰 세로 한 줄엔 자리가 없음)
export default function CategoryList({ categories, activeCategory, onSelectCategory }) {
    return (
        <div className="flex min-h-0 w-full flex-col gap-2 font-subheading md:h-full land:h-full" aria-label="카테고리">
            <div className={`${SIDEBAR_HEADER_WRAP_CLASS} hidden md:block land:block`}>
                <h2 className={SIDEBAR_HEADER_CLASS}>카테고리</h2>
            </div>
            <div
                className="flex gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:flex-col md:overflow-x-visible land:min-h-0 land:flex-col land:overflow-y-auto land:overflow-x-visible [&::-webkit-scrollbar]:hidden"
                aria-label="카테고리 목록"
            >
                {categories.map((label) => (
                    <CategoryRow
                        key={label}
                        label={label}
                        selected={activeCategory === label}
                        onSelect={() => onSelectCategory(label)}
                    />
                ))}
            </div>
        </div>
    )
}
