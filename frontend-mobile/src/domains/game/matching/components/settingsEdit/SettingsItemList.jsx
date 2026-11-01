// 설정 탭 본문: 항목 종류에 따라 숫자 줄·체크 줄, 일반 탭이면 뒤에 역할 구성
// SettingsEditSheet가 씀, 숨길 항목 규칙은 데스크톱 General/MeetingGameSetupTab과 같음
import { useMemo } from "react"
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "@/domains/game/setup/constants/gameSetupOptions.js"
import CheckRow from "./CheckRow.jsx"
import StepperRow from "./StepperRow.jsx"
import RoleCompositionBlock from "./RoleCompositionBlock.jsx"

// 탭 본문 (form = useSettingsForm 값)
export default function SettingsItemList({ form }) {
  const { activeTab, checks, ranges, setCheck, setRange, roleComposition, hiddenItemIds } = form
  const isGeneral = activeTab === "general"

  // 편집 못 하는 항목 + (직접 지정이면) 광대 수 줄 숨김
  const items = useMemo(() => {
    const hidden = new Set(hiddenItemIds ?? [])
    if (isGeneral && roleComposition.isCustom) hidden.add("joker-count")
    const source = isGeneral ? GENERAL_GAME_SETUP : MEETING_GAME_SETUP
    return source.filter((item) => !hidden.has(item.id))
  }, [isGeneral, roleComposition.isCustom, hiddenItemIds])

  return (
    <div className="flex flex-col">
      {items.map((item) =>
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
          <CheckRow
            key={item.id}
            label={item.label}
            description={item.description}
            checked={checks[item.id]}
            onChange={(next) => setCheck(item.id, next)}
          />
        ),
      )}
      {isGeneral ? <RoleCompositionBlock roleComposition={roleComposition} maxPlayers={ranges["max-players"]} /> : null}
    </div>
  )
}
