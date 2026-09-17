/**
 * 인게임 설정 "일반" 탭 본문
 * GENERAL_GAME_SETUP 항목 + 역할 구성 구역을 SetupTabContent에 넘김
 */
import { useMemo } from "react"
import { GENERAL_GAME_SETUP } from "../constants/gameSetupOptions.js"
import RoleCompositionSection from "./RoleCompositionSection.jsx"
import SetupTabContent from "./SetupTabContent.jsx"

/**
 * 일반 탭 설정 목록(비공개 로비·최대 인원·광대 수 등)
 * @param {string[]} [hiddenItemIds] - F-20 편집 모드에서 그리지 않을 항목 id(D-12의 추가 규칙).
 */
export default function GeneralGameSetupTab({ checks, ranges, setCheck, setRange, roleComposition, hiddenItemIds }) {
  // 역할 구성을 직접 지정하는 동안에는 기존 "광대 수" 스테퍼를 숨긴다 — 같은 값을 정하는
  // 입력이 두 개 보이면 어느 쪽이 실제로 반영되는지 알 수 없다(payload에는 항상
  // roleCounts.JOKER가 실린다). 자동 모드에서는 지금까지와 동일하게 그대로 보인다.
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
