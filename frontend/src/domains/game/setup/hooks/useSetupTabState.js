import { useMemo, useState } from "react"

/**
 * items 배열을 순회해 checkbox·stepper 타입별 초기 상태 객체를 생성합니다.
 * 이 함수의 결과를 useState 초기값으로 사용하며, items가 바뀔 때만 재실행됩니다.
 */
function buildInitialState(items) {
  const checks = {} // { [id]: boolean } — 체크박스 항목의 ON/OFF 상태
  const ranges = {} // { [id]: number } — 스테퍼 항목의 현재 값
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

/**
 * 게임 설정 탭 폼 상태 관리 훅.
 *
 * items 배열(constants)로부터 초기 상태를 파생하고,
 * 체크박스와 스테퍼 각각의 값을 독립적으로 업데이트합니다.
 *
 * @param {Array} items - GENERAL_GAME_SETUP | MEETING_GAME_SETUP 항목 배열
 */
export function useSetupTabState(items) {
  const initial = useMemo(() => buildInitialState(items), [items]) // items 변경 시에만 재계산
  const [checks, setChecks] = useState(initial.checks)
  const [ranges, setRanges] = useState(initial.ranges)

  /** 특정 id의 체크박스 값을 next로 갱신합니다. */
  const setCheck = (id, next) => setChecks((prev) => ({ ...prev, [id]: next }))
  /** 특정 id의 스테퍼 값을 next로 갱신합니다. */
  const setRange = (id, next) => setRanges((prev) => ({ ...prev, [id]: next }))

  return { checks, ranges, setCheck, setRange }
}
