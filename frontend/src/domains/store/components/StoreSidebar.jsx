import { useStoreCategoryFilter } from "../hooks/useStoreCategoryFilter.js"

// 상점 오른쪽 필터/정렬 사이드바 전체 wrapper입니다.
const WRAP_CLASS =
  "flex h-full w-full flex-col gap-[clamp(0.75rem,1.6vh,1.05rem)] px-[clamp(0.25rem,0.65vw,0.45rem)] py-[clamp(0.25rem,0.65vh,0.4rem)] font-subheading"

// 카테고리/정렬 섹션 제목 버튼 스타일입니다.
const HEADER_BTN_CLASS =
  "relative flex w-full items-center justify-between gap-2 rounded-sm bg-[#1a0f0a]/12 px-[clamp(0.5rem,0.95vw,0.7rem)] py-[clamp(0.4rem,0.85vh,0.6rem)] text-left text-[clamp(0.88rem,1.15vw,1rem)] font-bold text-[#140c08] transition-opacity hover:opacity-90"

// 필터 항목 목록 영역입니다.
const LIST_CLASS =
  "flex min-h-0 flex-1 flex-col gap-[clamp(0.3rem,0.65vh,0.42rem)] overflow-hidden rounded-sm bg-[#1a0f0a]/10 px-[clamp(0.5rem,0.95vw,0.75rem)] py-[clamp(0.45rem,0.9vh,0.65rem)]"

// 사이드바 안에서 체크 가능한 한 줄 항목입니다.
function CheckboxRow({ label, checked, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-[clamp(0.35rem,0.7vw,0.5rem)] border-0 bg-transparent p-0 text-left text-[clamp(0.82rem,1.05vw,0.92rem)] leading-snug text-[#2a1810]/85 transition-opacity hover:opacity-95"
      style={{ outline: "none" }}
      aria-pressed={checked}
    >
      <span
        className={`grid size-[clamp(0.8rem,1.1vw,0.95rem)] place-items-center rounded-[2px] bg-[#2a1810]/18 ${
          checked ? "text-[#6b2e18]" : "text-transparent"
        }`}
        aria-hidden="true"
      >
        ✓
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

// 필터 섹션의 현재 선택값을 보여주는 제목 버튼입니다.
function DropdownHeader({ title, value }) {
  return (
    <button type="button" className={HEADER_BTN_CLASS} style={{ outline: "none" }}>
      <span className="min-w-0 truncate">
        [{title}: {value}]
      </span>
    </button>
  )
}

// 상점의 카테고리 필터와 정렬 옵션을 보여주는 사이드바입니다.
export default function StoreSidebar() {
  const {
    categories,
    sortOptions,
    checkedCategory,
    activeSort,
    toggleCategory,
    setActiveSort,
  } = useStoreCategoryFilter()

  return (
    <div className={WRAP_CLASS} aria-label="카테고리 및 정렬">
      <section className="flex min-h-0 flex-1 flex-col gap-[clamp(0.45rem,0.95vh,0.65rem)]">
        <DropdownHeader title="카테고리" value="전체목록" />
        <div className={LIST_CLASS} aria-label="카테고리 목록">
          {categories.map((label) => (
            <CheckboxRow
              key={label}
              label={label}
              checked={checkedCategory.has(label)}
              onToggle={() => toggleCategory(label)}
            />
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-[clamp(0.45rem,0.95vh,0.65rem)]">
        <DropdownHeader title="정렬 방식" value={activeSort} />
        <div className={LIST_CLASS} aria-label="정렬 방식 목록">
          {sortOptions.map((label) => (
            <CheckboxRow
              key={label}
              label={label}
              checked={activeSort === label}
              onToggle={() => setActiveSort(label)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
