import {
  CATEGORY_ROW_CLASS,
  CATEGORY_ROW_SELECTED_CLASS,
  SIDEBAR_HEADER_CLASS,
  SIDEBAR_HEADER_WRAP_CLASS,
  SIDEBAR_LIST_CLASS,
  SIDEBAR_SECTION_CLASS,
  SIDEBAR_WRAP_CLASS,
} from "../../constants/storeLayoutStyle.js"

function CategoryRow({ label, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${CATEGORY_ROW_CLASS} ${selected ? CATEGORY_ROW_SELECTED_CLASS : ""}`}
      style={{ outline: "none" }}
      aria-pressed={selected}
    >
      {label}
    </button>
  )
}

function CategoryHeader() {
  return (
    <div className={SIDEBAR_HEADER_WRAP_CLASS}>
      <h2 className={SIDEBAR_HEADER_CLASS}>카테고리</h2>
    </div>
  )
}

export default function StoreSidebar({ categories, activeCategory, onSelectCategory }) {
  return (
    <div className={SIDEBAR_WRAP_CLASS} aria-label="카테고리">
      <section className={SIDEBAR_SECTION_CLASS}>
        <CategoryHeader />
        <div className={SIDEBAR_LIST_CLASS} aria-label="카테고리 목록">
          {categories.map((label) => (
            <CategoryRow
              key={label}
              label={label}
              selected={activeCategory === label}
              onSelect={() => onSelectCategory(label)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
