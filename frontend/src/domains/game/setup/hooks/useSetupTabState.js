import { useMemo, useState } from "react"

function buildInitialState(items) {
  const checks = {} // { [id]: boolean } — 체크박스 항목의 ON/OFF 상태
  const ranges = {} // { [id]: number } — 스테퍼 항목의 현재 값
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

export function useSetupTabState(items, { initialState, resetKey } = {}) {
  const initial = useMemo(() => {
    const base = buildInitialState(items) // items 변경 시에만 재계산
    if (!initialState) return base
    return {
      checks: { ...base.checks, ...(initialState.checks ?? {}) },
      ranges: { ...base.ranges, ...(initialState.ranges ?? {}) },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, initialState, resetKey])

  const [checks, setChecks] = useState(initial.checks)
  const [ranges, setRanges] = useState(initial.ranges)

  const [appliedInitial, setAppliedInitial] = useState(initial)
  if (appliedInitial !== initial) {
    setAppliedInitial(initial)
    setChecks(initial.checks)
    setRanges(initial.ranges)
  }

  const setCheck = (id, next) => setChecks((prev) => ({ ...prev, [id]: next }))
  const setRange = (id, next) => setRanges((prev) => ({ ...prev, [id]: next }))

  return { checks, ranges, setCheck, setRange }
}
