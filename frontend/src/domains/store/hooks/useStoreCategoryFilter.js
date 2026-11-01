// 상점 분류 고르기 상태 (처음엔 첫 분류)
// useStorePanel이 씀
import { useState } from "react"
import { STORE_CATEGORIES } from "../constants/storeFilterOptions.js"

// 처음 고른 분류 (스킨)
const DEFAULT_STORE_CATEGORY = STORE_CATEGORIES[0]

// 분류 목록과 지금 고른 분류
export function useStoreCategoryFilter() {
  const [activeCategory, setActiveCategory] = useState(DEFAULT_STORE_CATEGORY)

  // 고른 분류를 다시 누르면 풀어서 전체 상품을 보임
  const selectCategory = (label) => {
    setActiveCategory((prev) => (prev === label ? null : label))
  }

  return {
    categories: STORE_CATEGORIES,
    activeCategory,
    selectCategory,
  }
}
