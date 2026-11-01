// 상품 칸 이름 ('직업-스킨명'이면 두 줄로 나눠 보임)
// grid/ItemSlot이 씀
import {
    SLOT_NAME_JOB_CLASS,
    SLOT_NAME_TITLE_CLASS,
    SLOT_NAME_WRAP_CLASS,
} from "./slotStyle.js"

// 첫 '-' 앞은 위 작은 줄, 뒤는 큰 줄, '-'가 없으면 한 줄 (데스크톱 StoreItemSlotName과 같음)
function splitName(name) {
    const dashIndex = name.indexOf("-")
    if (dashIndex === -1) return { primary: name, secondary: null }
    return { primary: name.slice(0, dashIndex), secondary: name.slice(dashIndex + 1) }
}

// 이름 칸 모양은 데스크톱 값 그대로 (오른쪽은 확대 버튼 자리만큼 비움)
export default function SlotName({ name, reserveRight = false }) {
    const { primary, secondary } = splitName(String(name))

    return (
        <div className={`${SLOT_NAME_WRAP_CLASS} ${reserveRight ? "pr-5" : ""}`}>
            {secondary ? (
                <>
                    <p className={SLOT_NAME_JOB_CLASS}>{primary}</p>
                    <p className={SLOT_NAME_TITLE_CLASS}>{secondary}</p>
                </>
            ) : (
                <p className={SLOT_NAME_TITLE_CLASS}>{primary}</p>
            )}
        </div>
    )
}
