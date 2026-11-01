// 설정 항목 목록: 항목 종류에 따라 숫자 고르기 줄·체크 줄
// 방 설정 일반·회의 탭, 대기방 설정 변경 시트가 씀
import CheckRow from "./CheckRow.jsx"
import StepperRow from "./StepperRow.jsx"

// 숨길 id를 뺀 항목만 한 열로 그림 (form = useSetupForm 값), after는 목록 끝에 붙는 구역
export default function SettingList({ look, items, form, after = null }) {
  const { hiddenIds, checks, ranges, setCheck, setRange } = form
  const visible = hiddenIds?.size ? items.filter((item) => !hiddenIds.has(item.id)) : items

  return (
    <div className="flex flex-col">
      {visible.map((item) =>
        item.type === "stepper" ? (
          <StepperRow
            key={item.id}
            look={look}
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
          <CheckRow
            key={item.id}
            look={look}
            label={item.label}
            description={item.description}
            checked={checks[item.id]}
            onChange={(next) => setCheck(item.id, next)}
          />
        ),
      )}
      {after}
    </div>
  )
}
