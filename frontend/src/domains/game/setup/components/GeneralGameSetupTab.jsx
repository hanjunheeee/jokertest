import { useMemo } from "react"
import { GENERAL_GAME_SETUP } from "../constants/gameSetupOptions.js"
import RoleCompositionSection from "./RoleCompositionSection.jsx"
import SetupTabContent from "./SetupTabContent.jsx"

export default function GeneralGameSetupTab({ checks, ranges, setCheck, setRange, roleComposition, hiddenItemIds }) {
  const items = useMemo(() => {
    const hidden = new Set(hiddenItemIds ?? [])
    if (roleComposition.isCustom) hidden.add("joker-count")
    return hidden.size === 0
      ? GENERAL_GAME_SETUP
      : GENERAL_GAME_SETUP.filter((item) => !hidden.has(item.id))
  }, [roleComposition.isCustom, hiddenItemIds])

  return (
    <SetupTabContent
      items={items}
      checks={checks}
      ranges={ranges}
      setCheck={setCheck}
      setRange={setRange}
    >
      <RoleCompositionSection
        mode={roleComposition.mode}
        onSelectMode={roleComposition.selectMode}
        roleCounts={roleComposition.roleCounts}
        onChangeRoleCount={roleComposition.setRoleCount}
        maxPlayers={ranges["max-players"]}
        citizenCount={roleComposition.citizenCount}
        fixedRoleCount={roleComposition.fixedRoleCount}
        validation={roleComposition.validation}
      />
    </SetupTabContent>
  )
}
