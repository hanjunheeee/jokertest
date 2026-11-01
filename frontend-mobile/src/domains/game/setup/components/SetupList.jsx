// 설정 항목 목록: 항목 종류에 따라 숫자 고르기 줄·체크 줄
// tabs/GeneralTab·MeetingTab이 씀
import CheckboxRow from "./rows/CheckboxRow.jsx"
import StepperRow from "./rows/StepperRow.jsx"

// 숨길 id를 뺀 항목만 한 열로 그림
export default function SetupList({ items, hiddenIds, checks, ranges, setCheck, setRange }) {
  const visible = hiddenIds?.size ? items.filter((item) => !hiddenIds.has(item.id)) : items

  return (
    <div className="flex flex-col">
      {visible.map((item) =>
        item.type === "stepper" ? (
          <StepperRow
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
        ) : (
          <CheckboxRow
            key={item.id}
            label={item.label}
            description={item.description}
            checked={checks[item.id]}
            onChange={(next) => setCheck(item.id, next)}
          />
        ),
      )}
    </div>
  )
}
