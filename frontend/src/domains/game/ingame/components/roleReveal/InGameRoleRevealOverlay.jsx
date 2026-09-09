// 파일 역할: InGameRoleRevealOverlay.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS,
  INGAME_ROLE_REVEAL_ALLY_LIST_CLASS,
  INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS,
  INGAME_ROLE_REVEAL_DESCRIPTION_CLASS,
  INGAME_ROLE_REVEAL_HEADER_CLASS,
  INGAME_ROLE_REVEAL_NICKNAME_CLASS,
  INGAME_ROLE_REVEAL_ROLE_NAME_CLASS,
  INGAME_ROLE_REVEAL_TEAM_BADGE_CLASS,
} from "../../constants/roleReveal/ingameRoleRevealLayout.js"
import { resolveInGameRoleRevealAllies } from "../../utils/resolveInGameRoleRevealAllies.js"
import InGameParchmentModalAnimated from "../parchment/InGameParchmentModalAnimated.jsx"

/**
 * 인게임 파치먼트 역할 공개 — 전체 화면 오버레이.
 *
 * 셸(backdrop·양피지·확인 버튼·Escape 닫기)은 InGameParchmentModalAnimated가 담당하고,
 * 이 파일은 역할 공개 본문만 채운다 — 밤 역할 턴 안내·DAY/NIGHT 진입 연출과 같은 셸이다.
 *
 * 진영 배지(teamLabel)는 이 저장소의 표시 계약이라 그대로 유지한다.
 *
 * 닫기/다시 열기는 완전히 로컬 UI 상태다: socket emit·REST 요청·canonical 세션 상태 변경이
 * 전혀 없고, phase 전이나 게임 액션을 막지도 않는다(useInGameRoleReveal 참고).
 */
export default function InGameRoleRevealOverlay({
  open,
  onClose,
  roleInfo,
  players = [],
  primaryLabel = "확인",
}) {
  // 정의되지 않은/빈 역할은 절대 그리지 않는다 — open이 true여도 roleInfo가 없으면 아무 것도
  // 렌더하지 않는다(닉네임·역할·진영이 모두 갖춰졌을 때만 getInGameRoleRevealInfo가 값을 준다).
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
        <p className={INGAME_ROLE_REVEAL_TEAM_BADGE_CLASS}>{roleInfo.teamLabel}</p>
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
