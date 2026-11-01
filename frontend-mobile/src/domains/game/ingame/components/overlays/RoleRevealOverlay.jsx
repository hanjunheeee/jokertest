// 내 역할 공개 창: 닉네임·역할 이름·설명·동료 광대, 확인 누르면 닫힘 (역할 확인 알림은 훅이 따로 보냄)
// OverlayLayer가 씀, 값은 useInGameRoleReveal(useInGameOverlayStack 안)
import {
    ALLY_CHIP_CLASS,
    ALLY_LIST_CLASS,
    ALLY_SECTION_CLASS,
} from "@/domains/game/ingame/constants/roleReveal/ingameRoleRevealLayout.js"
import { resolveInGameRoleRevealAllies } from "@/domains/game/ingame/utils/roleReveal.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"

// 폰에서 역할 이름이 제일 먼저 눈에 띄게 크게
const HEADER_CLASS = "w-full space-y-0.5 border-b border-[#6b4321]/40 pb-2"
const NICKNAME_CLASS = "text-[1rem] font-semibold tracking-wide text-[#5b3a20] land:text-[0.9rem]"
const ROLE_NAME_CLASS =
    "font-display text-[2.1rem] font-medium leading-tight tracking-wide text-[#3a1a0c] antialiased md:text-[2.6rem] land:text-[1.6rem]"
const DESC_CLASS = "text-[0.92rem] leading-relaxed [word-break:keep-all] text-[#4a2c14] land:text-[0.82rem] land:leading-snug"

// roleInfo 없으면 안 그림, 데스크톱처럼 동료 광대는 판 참가자 닉네임으로 바꿔 보임
export default function RoleRevealOverlay({ open, onClose, roleInfo, players = [] }) {
    if (!roleInfo) return null

    const allies = resolveInGameRoleRevealAllies(roleInfo.allies, players)

    return (
        <ParchmentDialog
            open={open}
            variantKey="roleReveal"
            zClass="z-[55]"
            onDismiss={onClose}
            wrapperProps={{ "data-ingame-role-reveal": roleInfo.role }}
        >
            <div className={HEADER_CLASS}>
                {roleInfo.nickname ? <p className={NICKNAME_CLASS}>{roleInfo.nickname}</p> : null}
                <p className={ROLE_NAME_CLASS}>{roleInfo.roleName}</p>
            </div>

            {roleInfo.description ? <p className={DESC_CLASS}>{roleInfo.description}</p> : null}

            {allies.length ? (
                <div className={ALLY_SECTION_CLASS}>
                    <p>동료 광대</p>
                    <ul className={ALLY_LIST_CLASS}>
                        {allies.map((ally) => (
                            <li key={ally.uuid} className={ALLY_CHIP_CLASS}>{ally.nickname}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </ParchmentDialog>
    )
}
