import {
  SLOT_NAME_JOB_CLASS,
  SLOT_NAME_TITLE_CLASS,
  SLOT_NAME_WRAP_CLASS,
} from "../../constants/storeLayoutStyle.js"

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
