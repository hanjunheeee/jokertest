// 설정 폼 체크·숫자 값 상태 (항목 기본값 + 받은 첫 값)
// GameSetupPanel이 씀, 첫 값·초기화 키가 바뀌면 렌더 중에 바로 폼을 다시 채움
import { useMemo, useState } from "react"

// 항목 기본값으로 첫 값 만들기 (formState의 buildDefaultFormState와 같은 계산)
function buildInitialState(items) {
  const checks = {}
  const ranges = {}
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

// 폼 값 상태
export function useSetupTabState(items, { initialState, resetKey } = {}) {
  // 기본값 위에 받은 첫 값 덮기 (resetKey 바뀌면 다시 계산)
  const initial = useMemo(() => {
    const base = buildInitialState(items)
    if (!initialState) return base
    return {
      checks: { ...base.checks, ...(initialState.checks ?? {}) },
      ranges: { ...base.ranges, ...(initialState.ranges ?? {}) },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, initialState, resetKey])

  const [checks, setChecks] = useState(initial.checks)
  const [ranges, setRanges] = useState(initial.ranges)

  // 첫 값이 바뀌면 렌더 중에 바로 폼 값 바꿈
  const [appliedInitial, setAppliedInitial] = useState(initial)
  if (appliedInitial !== initial) {
    setAppliedInitial(initial)
    setChecks(initial.checks)
    setRanges(initial.ranges)
  }

  // 항목 하나 바꾸기
  const setCheck = (id, next) => setChecks((prev) => ({ ...prev, [id]: next }))
  const setRange = (id, next) => setRanges((prev) => ({ ...prev, [id]: next }))

  return { checks, ranges, setCheck, setRange }
}
