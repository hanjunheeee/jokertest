import { useState } from "react"
import { STORE_CATEGORIES } from "../constants/storeFilterOptions.js"

const DEFAULT_STORE_CATEGORY = STORE_CATEGORIES[0]

export function useStoreCategoryFilter() {
  const [activeCategory, setActiveCategory] = useState(DEFAULT_STORE_CATEGORY)

  const selectCategory = (label) => {
    setActiveCategory((prev) => (prev === label ? null : label))
  }

  return {
    categories: STORE_CATEGORIES,
    activeCategory,
    selectCategory,
  }
}
