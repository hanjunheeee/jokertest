import SetupCheckboxRow from "./rows/SetupCheckboxRow.jsx"
import SetupStepperRow from "./rows/SetupStepperRow.jsx"

const SETUP_LIST_GAP_CLASS =
  "flex min-h-0 flex-1 flex-col justify-start gap-[clamp(2rem,2.1vh,2.5rem)]"

export default function SetupTabContent({ items, checks, ranges, setCheck, setRange, children }) {
  return (
    <div className={SETUP_LIST_GAP_CLASS}>
      {items.map((item) => {
        if (item.type === "stepper") {
          return (
            <SetupStepperRow
              key={item.id}
              label={item.label}
              description={item.description}
              value={ranges[item.id]}
              min={item.min}
              max={item.max}
              step={item.step}
              unit={item.unit}
              onChange={(next) => setRange(item.id, next)}
            />
          )
        }

        return (
          <SetupCheckboxRow
            key={item.id}
            label={item.label}
            description={item.description}
            checked={checks[item.id]}
            onChange={(next) => setCheck(item.id, next)}
          />
        )
      })}
      {children}
    </div>
  )
}
