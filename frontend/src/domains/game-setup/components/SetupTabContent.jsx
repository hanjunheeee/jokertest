import { useMemo, useState } from "react"
import SetupCheckboxRow from "./SetupCheckboxRow.jsx"
import SetupRangeRow from "./SetupRangeRow.jsx"

const SETUP_LIST_GAP_CLASS =
  "flex min-h-0 flex-1 flex-col justify-start gap-[clamp(2rem,2.1vh,2.5rem)]"

function buildInitialState(items) {
  const checks = {}
  const ranges = {}

  for (const item of items) {
    if (item.type === "checkbox") checks[item.id] = item.defaultChecked
    if (item.type === "range") ranges[item.id] = item.defaultValue
  }

  return { checks, ranges }
}

export default function SetupTabContent({ items }) {
  const initial = useMemo(() => buildInitialState(items), [items])
  const [checks, setChecks] = useState(initial.checks)
  const [ranges, setRanges] = useState(initial.ranges)

  return (
    <div className={SETUP_LIST_GAP_CLASS}>
      {items.map((item) => {
        if (item.type === "range") {
          return (
            <SetupRangeRow
              key={item.id}
              label={item.label}
              description={item.description}
              value={ranges[item.id]}
              min={item.min}
              max={item.max}
              onChange={(next) =>
                setRanges((prev) => ({ ...prev, [item.id]: next }))
              }
            />
          )
        }

        return (
          <SetupCheckboxRow
            key={item.id}
            label={item.label}
            description={item.description}
            checked={checks[item.id]}
            onChange={(next) =>
              setChecks((prev) => ({ ...prev, [item.id]: next }))
            }
          />
        )
      })}
    </div>
  )
}
