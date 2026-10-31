import {
  INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS,
  INGAME_ROLE_REVEAL_ALLY_LIST_CLASS,
  INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS,
  INGAME_ROLE_REVEAL_DESCRIPTION_CLASS,
  INGAME_ROLE_REVEAL_HEADER_CLASS,
  INGAME_ROLE_REVEAL_NICKNAME_CLASS,
  INGAME_ROLE_REVEAL_ROLE_NAME_CLASS,
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
      <div className={INGAME_ROLE_REVEAL_HEADER_CLASS}>
        {roleInfo.nickname ? (
          <p className={INGAME_ROLE_REVEAL_NICKNAME_CLASS}>{roleInfo.nickname}</p>
        ) : null}
        <p className={INGAME_ROLE_REVEAL_ROLE_NAME_CLASS}>{roleInfo.roleName}</p>
      </div>

      {roleInfo.description ? (
        <p className={INGAME_ROLE_REVEAL_DESCRIPTION_CLASS}>{roleInfo.description}</p>
      ) : null}

      {allies.length ? (
        <div className={INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS}>
          <p>동료 광대</p>
          <ul className={INGAME_ROLE_REVEAL_ALLY_LIST_CLASS}>
            {allies.map((ally) => (
              <li key={ally.uuid} className={INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS}>
                {ally.nickname}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </InGameParchmentModalAnimated>
  )
}
