import { useState } from "react"

export function useSkinCardWearOverlay() {
  const [open, setOpen] = useState(false)

  return {
    open,
    openOverlay: () => setOpen(true),
    closeOverlay: () => setOpen(false),
  }
}
