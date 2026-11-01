// 설정 탭 공통 목록: 항목 종류에 따라 숫자 고르기 줄·체크 줄
// GeneralGameSetupTab·MeetingGameSetupTab이 씀, 뒤에 덧붙일 내용은 children
import SetupCheckboxRow from "./rows/SetupCheckboxRow.jsx"
import SetupStepperRow from "./rows/SetupStepperRow.jsx"

// 줄 사이 간격
const SETUP_LIST_GAP_CLASS =
  "flex min-h-0 flex-1 flex-col justify-start gap-[clamp(2rem,2.1vh,2.5rem)]"

// 설정 항목 목록
export default function SetupTabContent({ items, checks, ranges, setCheck, setRange, children }) {
  return (
    <div className={SETUP_LIST_GAP_CLASS}>
      {items.map((item) => {
        // 숫자 고르기 항목
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

        // 그 밖은 체크 줄
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
