// 상점 분류 탭 (가로로 미는 한 줄, 데스크톱 오른쪽 분류 목록 대신)
// top/StoreTopBar 탭 자리에 pages/StorePage가 넣어 씀
// 고른 탭을 다시 누르면 풀려서 전체 상품 (데스크톱 useStoreCategoryFilter 동작 그대로)

const TAB_CLASS =
    "h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-md border px-3.5 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-none transition-[background-color,color]"

const TAB_IDLE_CLASS = "border-[#8b7355]/45 bg-[#f5f0e6]/85 text-[#2a1810]/90 active:bg-[#e6dccb]"

const TAB_SELECTED_CLASS = "border-[#b83232]/55 bg-[#2a1810]/88 text-white [box-shadow:inset_0_1px_0_rgba(245,240,230,0.12)]"

// 탭 줄만 옆으로 밀림 (화면 자체는 가로 스크롤 없음)
export default function CategoryTabs({ categories, activeCategory, onSelect }) {
    return (
        <div
            className="flex gap-1.5 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="카테고리 목록"
        >
            {categories.map((label) => {
                const selected = activeCategory === label
                return (
                    <button
                        key={label}
                        type="button"
                        onClick={() => onSelect(label)}
                        className={`${TAB_CLASS} ${selected ? TAB_SELECTED_CLASS : TAB_IDLE_CLASS}`}
                        style={{ outline: "none" }}
                        aria-pressed={selected}
                    >
                        {label}
                    </button>
                )
            })}
        </div>
    )
}
