import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  CORNER_ACTION_BTN_CLASS,
  CORNER_ACTION_BTN_IMG_CLASS,
  CORNER_ACTION_BTN_LABEL_CLASS,
  CORNER_ACTION_BTN_WRAP_CLASS,
} from "../../constants/actions/ingameCornerActionLayout.js"

export default function InGameImageActionButton({
  src,
  label,
  disabled = false,
  onClick,
  className = CORNER_ACTION_BTN_CLASS,
  imgClassName = CORNER_ACTION_BTN_IMG_CLASS,
  labelClassName = CORNER_ACTION_BTN_LABEL_CLASS,
  ...rest
}) {
  return (
    <div className={CORNER_ACTION_BTN_WRAP_CLASS}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={className}
        style={{ outline: "none" }}
        {...rest}
      >
        <PublicAsset src={src} alt="" className={imgClassName} />
        <span className={labelClassName}>{label}</span>
      </button>
    </div>
  )
}
