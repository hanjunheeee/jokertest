import {
  STORE_CATEGORY_ROW_CLASS,
  STORE_CATEGORY_ROW_SELECTED_CLASS,
  STORE_SIDEBAR_HEADER_CLASS,
  STORE_SIDEBAR_HEADER_WRAP_CLASS,
  STORE_SIDEBAR_LIST_CLASS,
  STORE_SIDEBAR_SECTION_CLASS,
  STORE_SIDEBAR_WRAP_CLASS,
} from "../../constants/storeLayoutStyle.js"

function CategoryRow({ label, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${STORE_CATEGORY_ROW_CLASS} ${selected ? STORE_CATEGORY_ROW_SELECTED_CLASS : ""}`}
      style={{ outline: "none" }}
      aria-pressed={selected}
    >
      {label}
    </button>
  )
}

function CategoryHeader() {
  return (
    <div className={STORE_SIDEBAR_HEADER_WRAP_CLASS}>
      <h2 className={STORE_SIDEBAR_HEADER_CLASS}>카테고리</h2>
    </div>
  )
}

export default function StoreSidebar({ categories, activeCategory, onSelectCategory }) {
  return (
    <div className={STORE_SIDEBAR_WRAP_CLASS} aria-label="카테고리">
      <section className={STORE_SIDEBAR_SECTION_CLASS}>
        <CategoryHeader />
        <div className={STORE_SIDEBAR_LIST_CLASS} aria-label="카테고리 목록">
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
