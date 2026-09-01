import { PODIUM_ASSETS } from "@/domains/podium/constants/podiumAssets.js"
import {
  PODIUM_HEADER_PLATE_CLASS,
  PODIUM_HEADER_TITLE_CLASS,
  PODIUM_HEADER_WRAP_CLASS,
} from "@/domains/podium/constants/podiumLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 명예의 전당 — 상단 타이틀 (탑레벨 프레임) */
export default function PodiumHeader() {
  return (
    <header className={PODIUM_HEADER_WRAP_CLASS}>
      <PublicAsset src={PODIUM_ASSETS.headerPlate} alt="" className={PODIUM_HEADER_PLATE_CLASS} />
      <h1 className={PODIUM_HEADER_TITLE_CLASS}>명예의 전당</h1>
    </header>
  )
}
