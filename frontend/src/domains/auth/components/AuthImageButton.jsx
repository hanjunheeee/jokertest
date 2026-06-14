import PublicAsset from "@/shared/ui/PublicAsset"

const AUTH_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.95]"

export default function AuthImageButton({
  src,
  label,
  className = "",
  type = "button",
  onClick,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      className={`group block w-full cursor-pointer border-0 bg-transparent p-0 leading-none ${className}`}
    >
      <PublicAsset src={src} alt="" className={AUTH_BTN_IMG_CLASS} />
    </button>
  )
}
