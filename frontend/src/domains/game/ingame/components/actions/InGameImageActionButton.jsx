// 그림 행동 버튼: 그림 위에 글자 얹은 구석 패널용 버튼 하나
// 구석 행동 패널(InGameCornerActionPanel)이 사용
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  CORNER_ACTION_BTN_CLASS,
  CORNER_ACTION_BTN_IMG_CLASS,
  CORNER_ACTION_BTN_LABEL_CLASS,
  CORNER_ACTION_BTN_WRAP_CLASS,
} from "../../constants/actions/ingameCornerActionLayout.js"

// 나머지 속성(...rest)은 button에 그대로 붙임 (단계 행동 표시 달기용)
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
