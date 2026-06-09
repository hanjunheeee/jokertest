import PublicAsset from "@/shared/ui/PublicAsset"

export default function CheckBox({
  checked,
  onChange,
  ariaLabel,
  checkboxSrc,
  checkMarkSrc,
  className = "relative block w-[clamp(1.75rem,2.45vw,2rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0",
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={className}
    >
      <PublicAsset
        src={checkboxSrc}
        alt=""
        className="block h-auto w-full select-none"
      />
      {checked ? (
        <PublicAsset
          src={checkMarkSrc}
          alt=""
          className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
        />
      ) : null}
    </button>
  )
}
