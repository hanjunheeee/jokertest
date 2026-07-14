import { useState } from "react"
import {
  STORE_CATEGORIES,
  STORE_SORT_OPTIONS,
} from "../constants/storeFilterOptions.js"

// 상점 사이드바의 카테고리 체크 상태와 정렬 선택 상태를 관리합니다.
export function useStoreCategoryFilter() {
  // 현재 체크된 카테고리 이름 목록입니다.
  const [checkedCategory, setCheckedCategory] = useState(
    () => new Set(["황금 가면 세트"]),
  )

  // 현재 선택된 정렬 방식입니다.
  const [activeSort, setActiveSort] = useState("신규순")

  // 카테고리를 누를 때 체크/해제를 토글합니다.
  const toggleCategory = (label) => {
    setCheckedCategory((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return {
    categories: STORE_CATEGORIES,
    sortOptions: STORE_SORT_OPTIONS,
    checkedCategory,
    activeSort,
    toggleCategory,
    setActiveSort,
  }
}
