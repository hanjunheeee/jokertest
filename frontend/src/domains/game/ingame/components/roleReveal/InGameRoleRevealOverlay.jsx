import {
  ALLY_CHIP_CLASS,
  ALLY_LIST_CLASS,
  ALLY_SECTION_CLASS,
  DESC_CLASS,
  HEADER_CLASS,
  NICKNAME_CLASS,
  ROLE_NAME_CLASS,
} from "../../constants/roleReveal/ingameRoleRevealLayout.js"
import { resolveInGameRoleRevealAllies } from "../../utils/resolveInGameRoleRevealAllies.js"
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
      wrapProps={{ "aria-hidden": !open }}
    >
      <div className={HEADER_CLASS}>
        {roleInfo.nickname ? (
          <p className={NICKNAME_CLASS}>{roleInfo.nickname}</p>
        ) : null}
        <p className={ROLE_NAME_CLASS}>{roleInfo.roleName}</p>
      </div>

      {roleInfo.description ? (
        <p className={DESC_CLASS}>{roleInfo.description}</p>
      ) : null}

      {allies.length ? (
        <div className={ALLY_SECTION_CLASS}>
          <p>동료 광대</p>
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
