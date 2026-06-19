import { useState } from "react"

/** 사이드바에 표시할 카테고리 목록 (API 연동 전 고정값) */
const CATEGORIES = [
  "황금 가면 세트",
  "흑염의 처형",
  "고대 수호자 칭호",
  "귀궁의 처형",
  "자수정 가면",
  "왕궁 수비대 스킨",
]

/** 정렬 옵션 목록 */
const SORT_OPTIONS = ["신규순", "인기순", "가격 낮은순", "가격 높은순"]

/**
 * 상점 카테고리 선택 및 정렬 상태 관리 훅.
 *
 * checkedCategory는 Set으로 관리하여 다중 카테고리 선택을 지원합니다.
 * 초기값은 첫 번째 카테고리("황금 가면 세트")가 선택된 상태입니다.
 */
export function useStoreCategoryFilter() {
  const [checkedCategory, setCheckedCategory] = useState(
    () => new Set(["황금 가면 세트"]), // 초기 선택 카테고리 — lazy initializer로 Set 재생성 방지
  )
  const [activeSort, setActiveSort] = useState("신규순") // 현재 선택된 정렬 기준

  /** 카테고리를 토글합니다. 이미 선택된 경우 해제, 미선택 시 추가. */
  const toggleCategory = (label) => {
    setCheckedCategory((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return {
    categories: CATEGORIES,
    sortOptions: SORT_OPTIONS,
    checkedCategory,
    activeSort,
    toggleCategory,
    setActiveSort,
  }
}
