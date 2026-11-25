// 내 역할 공개 창: 닉네임·역할 이름·설명·동료 광대, 확인 누르면 화면에서만 닫힘, 10초 지나면 저절로 닫힘 (서버는 확인을 안 기다림)
// OverlayLayer가 씀, 값은 useInGameRoleReveal(useInGameOverlayStack 안), 글자 모양은 데스크톱 상수 그대로
import { useEffect, useLayoutEffect, useRef } from "react"
import {
    ALLY_CHIP_CLASS,
    ALLY_LIST_CLASS,
    ALLY_SECTION_CLASS,
    DESC_CLASS,
    HEADER_CLASS,
    NICKNAME_CLASS,
    ROLE_NAME_CLASS,
} from "@/domains/game/ingame/constants/roleReveal/ingameRoleRevealLayout.js"
import { resolveInGameRoleRevealAllies } from "@/domains/game/ingame/utils/roleReveal.js"
import ParchmentDialog from "./parchment/ParchmentDialog.jsx"

// 가로 폰은 높이가 낮아 데스크톱 vw 글자가 넘침 → 가로 폰만 글자 줄임
const LAND_NICK = "land:text-[0.95rem]"
const LAND_ROLE = "land:text-[1.6rem] land:leading-tight"
const LAND_DESC = "land:text-[0.85rem] land:leading-snug"

// 역할 공개 시간 (서버 규칙 10초)
const AUTO_CLOSE_MS = 10_000

// 열린 뒤 10초면 닫음 (onClose는 그릴 때마다 새 함수라 ref로 들고 있음)
function useAutoClose(open, onClose) {
    const closeRef = useRef(onClose)
    useLayoutEffect(() => {
        closeRef.current = onClose
    })
    useEffect(() => {
        if (!open) return undefined
        const id = setTimeout(() => closeRef.current?.(), AUTO_CLOSE_MS)
        return () => clearTimeout(id)
    }, [open])
}

// roleInfo 없으면 안 그림, 동료 광대는 판 참가자 닉네임으로 바꿔 보임 (데스크톱과 같음)
export default function RoleRevealOverlay({ open, onClose, roleInfo, players = [], primaryLabel = "확인" }) {
    useAutoClose(open && Boolean(roleInfo), onClose)
    if (!roleInfo) return null

    const allies = resolveInGameRoleRevealAllies(roleInfo.allies, players)

    return (
        <ParchmentDialog
            open={open}
            variantKey="roleReveal"
            onDismiss={onClose}
            confirmLabel={primaryLabel}
            wrapperProps={{ "data-ingame-role-reveal": roleInfo.role }}
        >
            <div className={HEADER_CLASS}>
                {roleInfo.nickname ? <p className={`${NICKNAME_CLASS} ${LAND_NICK}`}>{roleInfo.nickname}</p> : null}
                <p className={`${ROLE_NAME_CLASS} ${LAND_ROLE}`}>{roleInfo.roleName}</p>
            </div>

            {roleInfo.description ? <p className={`${DESC_CLASS} ${LAND_DESC}`}>{roleInfo.description}</p> : null}

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
