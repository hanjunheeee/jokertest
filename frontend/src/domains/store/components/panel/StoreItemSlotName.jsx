import {
  STORE_SLOT_NAME_JOB_CLASS,
  STORE_SLOT_NAME_TITLE_CLASS,
  STORE_SLOT_NAME_WRAP_CLASS,
} from "../../constants/storeLayoutStyle.js"

/** @param {string} name */
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

/** 상품 슬롯 이름 — 직업(보조) + 상품명(강조), 최대 두 줄 */
export default function StoreItemSlotName({ children }) {
  const name = String(children)
  const { primary, secondary } = splitStoreSlotName(name)

  return (
    <div className={STORE_SLOT_NAME_WRAP_CLASS}>
      {secondary ? (
        <>
          <p className={STORE_SLOT_NAME_JOB_CLASS}>{primary}</p>
          <p className={STORE_SLOT_NAME_TITLE_CLASS}>{secondary}</p>
        </>
      ) : (
        <p className={STORE_SLOT_NAME_TITLE_CLASS}>{primary}</p>
      )}
    </div>
  )
}
