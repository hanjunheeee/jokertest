// 판 시작 때 내 그림(스킨)·직업·진영·같은 편 보여 주는 창
// InGamePage가 씀
import {
  ALLY_CHIP_CLASS,
  ALLY_LIST_CLASS,
  ALLY_SECTION_CLASS,
  DESC_CLASS,
  HEADER_CLASS,
  HEADER_ROW_CLASS,
  NICKNAME_CLASS,
  ROLE_NAME_CLASS,
  STANDING_IMG_CLASS,
  TEAM_LABEL_CLASS,
} from "../../constants/roleReveal/ingameRoleRevealLayout.js"
import { resolveInGameRoleRevealAllies } from "../../utils/roleReveal.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import InGameParchmentModalAnimated from "../parchment/InGameParchmentModalAnimated.jsx"

export default function InGameRoleRevealOverlay({
  open,
  onClose,
  roleInfo,
  players = [],
  primaryLabel = "확인",
}) {
  if (!roleInfo) return null

  const allies = resolveInGameRoleRevealAllies(roleInfo.allies, players)

  return (
    <InGameParchmentModalAnimated
      open={open}
      variantKey="roleReveal"
      onDismiss={onClose}
      confirmLabel={primaryLabel}
    >
      {/* 내 그림: 낀 스킨, 없으면 직업 기본 그림 (글로 직업을 알려 주니 그림 설명은 비움) */}
      <div className={HEADER_ROW_CLASS}>
        {roleInfo.standingSrc ? (
          <PublicAsset src={roleInfo.standingSrc} alt="" className={STANDING_IMG_CLASS} data-ingame-role-reveal-standing="" />
        ) : null}
        <div className={`min-w-0 ${HEADER_CLASS}`}>
          {roleInfo.nickname ? (
            <p className={NICKNAME_CLASS}>{roleInfo.nickname}</p>
          ) : null}
          <p className={ROLE_NAME_CLASS}>{roleInfo.roleName}</p>
          {roleInfo.teamLabel ? (
            <p className={TEAM_LABEL_CLASS}>{roleInfo.teamLabel}</p>
          ) : null}
        </div>
      </div>

      {roleInfo.description ? (
        <p className={DESC_CLASS}>{roleInfo.description}</p>
      ) : null}

      {allies.length ? (
        <div className={ALLY_SECTION_CLASS}>
          <p>동료 {roleInfo.roleName}</p>
          <ul className={ALLY_LIST_CLASS}>
            {allies.map((ally) => (
              <li key={ally.uuid} className={ALLY_CHIP_CLASS}>
                {ally.nickname}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </InGameParchmentModalAnimated>
  )
}
