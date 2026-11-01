// 상품 칸 이름 ('직업-스킨명'이면 두 줄로 나눠 보임)
// grid/StoreItemSlot이 씀
import {
  SLOT_NAME_JOB_CLASS,
  SLOT_NAME_TITLE_CLASS,
  SLOT_NAME_WRAP_CLASS,
} from "../../constants/storeLayoutStyle.js"

// 첫 '-' 앞은 위 작은 줄, 뒤는 큰 줄, '-'가 없으면 한 줄
function splitStoreSlotName(name) {
  const dashIndex = name.indexOf("-")
  if (dashIndex === -1) {
    return { primary: name, secondary: null }
  }

  return {
    primary: name.slice(0, dashIndex),
    secondary: name.slice(dashIndex + 1),
  }
}

// 이름을 글자로 받아 나눠지면 두 줄, 아니면 한 줄
export default function StoreItemSlotName({ children }) {
  const name = String(children)
  const { primary, secondary } = splitStoreSlotName(name)

  return (
    <div className={SLOT_NAME_WRAP_CLASS}>
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
