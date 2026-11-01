// 그림 버튼 (버튼 그림 위에 글자 얹기), 모양은 look 한 벌로 고름
// 인증·모드·대기방·결과·방 설정·설정·계정·마이페이지·이모티콘·알림 버튼이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { IMAGE_BUTTON_LOOKS } from "@m/shared/ui/button/imageButtonLooks.js"

// look = { button, img, label, labelSize } 또는 이름, className은 버튼에 덧붙임
// labelClassName은 글자 크기 칸(labelSize)을 바꿈, 이름(aria-label) 있으면 보이는 글자는 읽기에서 숨김
export default function ImageButton({
  src,
  label,
  ariaLabel,
  look = "stretch",
  className = "",
  labelClassName,
  sfxKind,
  busy = false,
  buttonRef,
  type = "button",
  ...rest
}) {
  const style = typeof look === "string" ? IMAGE_BUTTON_LOOKS[look] : look
  // labelAsName인 모양은 ariaLabel 없으면 보이는 글자를 이름으로 씀
  const name = ariaLabel ?? (style.labelAsName ? label : undefined)

  return (
    <button
      ref={buttonRef}
      type={type}
      aria-label={name}
      aria-busy={busy || undefined}
      data-sfx-kind={sfxKind}
      className={`${style.button} ${className}`}
      {...rest}
    >
      <PublicAsset src={src} alt="" className={style.img} />
      {label ? (
        <span className={`${style.label} ${labelClassName ?? style.labelSize ?? ""}`} aria-hidden={name ? "true" : undefined}>
          {label}
        </span>
      ) : null}
    </button>
  )
}
