import { useMemo, useState } from "react"

function buildInitialState(items) {
  const checks = {}
  const ranges = {}
  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "stepper") ranges[item.id] = item.defaultValue
  }
  return { checks, ranges }
}

export function useSetupTabState(items, { initialState, resetKey } = {}) {
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
