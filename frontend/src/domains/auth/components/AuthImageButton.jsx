import PublicAsset from "@/shared/ui/PublicAsset";

const AUTH_BTN_IMG_CLASS = "block h-auto w-full select-none"

const BTN_INTERACTION_CLASS =
  "transition-transform duration-200 ease-out hover:scale-[1.05] active:scale-[0.95] disabled:hover:scale-100 disabled:active:scale-100"

const VISIBLE_LABEL_ALIGN_CLASS = {
  left: "justify-start text-left pl-[14%]",
  center: "justify-center text-center",
  right: "justify-end text-right pr-[14%]",
}

export default function AuthImageButton({
  src,
  label,
  className = "",
  type = "button",
  onClick,
  disabled = false,
  visibleLabel,
  visibleLabelClassName = "text-sm",
  visibleLabelAlign = "center",
  inline = false,
  interactionClassName = BTN_INTERACTION_CLASS,
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`relative border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60 ${interactionClassName} ${
        inline ? "inline-block w-auto shrink-0 cursor-pointer" : "mx-auto block w-[92%] cursor-pointer"
      } ${className}`}
      {...rest}
    >
      <PublicAsset src={src} alt="" className={AUTH_BTN_IMG_CLASS} />

      {visibleLabel && (
        <span className={`pointer-events-none absolute inset-0 flex items-center font-subheading font-bold text-white ${VISIBLE_LABEL_ALIGN_CLASS[visibleLabelAlign] ?? VISIBLE_LABEL_ALIGN_CLASS.center} ${visibleLabelClassName}`}>
          {visibleLabel}
        </span>
      )}
    </button>
  )
}
