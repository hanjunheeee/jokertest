/**
 * 상점 사이드바.
 *
 * 카테고리 선택·정렬 상태 관리는 useStoreCategoryFilter에 위임합니다.
 * 이 컴포넌트는 카테고리·정렬 목록을 CheckboxRow로 렌더하는 역할만 합니다.
 */
import { useStoreCategoryFilter } from "../hooks/useStoreCategoryFilter.js"

const WRAP_CLASS =
  "flex h-full w-full flex-col gap-[clamp(0.75rem,1.6vh,1.05rem)] px-[clamp(0.25rem,0.65vw,0.45rem)] py-[clamp(0.25rem,0.65vh,0.4rem)] font-subheading"

const HEADER_BTN_CLASS =
  "relative flex w-full items-center justify-between gap-2 rounded-sm bg-[#1a0f0a]/12 px-[clamp(0.5rem,0.95vw,0.7rem)] py-[clamp(0.4rem,0.85vh,0.6rem)] text-left text-[clamp(0.88rem,1.15vw,1rem)] font-bold text-[#140c08] transition-opacity hover:opacity-90"

const LIST_CLASS =
  "flex min-h-0 flex-1 flex-col gap-[clamp(0.3rem,0.65vh,0.42rem)] overflow-hidden rounded-sm bg-[#1a0f0a]/10 px-[clamp(0.5rem,0.95vw,0.75rem)] py-[clamp(0.45rem,0.9vh,0.65rem)]"

/** aria-pressed로 선택 상태를 노출하는 체크박스 버튼 행 */
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

/** 드롭다운 헤더 — 현재 선택값 표시 (실제 드롭다운 기능은 미구현) */
function DropdownHeader({ title, value }) {
  return (
    <button type="button" className={HEADER_BTN_CLASS} style={{ outline: "none" }}>
      <span className="min-w-0 truncate">
        [{title}: {value}]
      </span>
    </button>
  )
}

export default function StoreSidebar() {
  const {
    categories,      // 카테고리 목록 (고정 배열)
    sortOptions,     // 정렬 옵션 목록 (고정 배열)
    checkedCategory, // 현재 선택된 카테고리 Set
    activeSort,      // 현재 선택된 정렬 기준
    toggleCategory,  // 카테고리 토글 핸들러
    setActiveSort,   // 정렬 기준 변경 핸들러
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
              checked={checkedCategory.has(label)} // Set에 포함되면 선택 상태
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
              checked={activeSort === label} // 단일 선택 — 현재 activeSort와 일치하면 선택
              onToggle={() => setActiveSort(label)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
