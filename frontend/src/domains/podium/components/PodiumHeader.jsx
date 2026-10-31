import { PODIUM_ASSETS } from "../constants/podiumAssets.js"
import {
  PODIUM_HEADER_PLATE_CLASS,
  PODIUM_HEADER_TITLE_CLASS,
  PODIUM_HEADER_WRAP_CLASS,
} from "../constants/podiumLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"

export default function PodiumHeader() {
  return (
    <header className={PODIUM_HEADER_WRAP_CLASS}>
      <PublicAsset src={PODIUM_ASSETS.headerPlate} alt="" className={PODIUM_HEADER_PLATE_CLASS} />
      <h1 className={PODIUM_HEADER_TITLE_CLASS}>명예의 전당</h1>
    </header>
  )
}
