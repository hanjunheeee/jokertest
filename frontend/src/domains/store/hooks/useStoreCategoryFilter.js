import { useState } from "react"
import { STORE_CATEGORIES } from "../constants/storeFilterOptions.js"

const DEFAULT_STORE_CATEGORY = STORE_CATEGORIES[0]

// 상점 사이드바의 선택된 카테고리를 관리합니다.
export function useStoreCategoryFilter() {
  // 현재 선택된 카테고리입니다. null이면 전체 목록입니다.
  const [activeCategory, setActiveCategory] = useState(DEFAULT_STORE_CATEGORY)

  // 카테고리를 선택합니다. 같은 항목을 다시 누르면 선택을 해제합니다.
  const selectCategory = (label) => {
    setActiveCategory((prev) => (prev === label ? null : label))
  }

  return {
    categories: STORE_CATEGORIES,
    activeCategory,
    selectCategory,
  }
}
