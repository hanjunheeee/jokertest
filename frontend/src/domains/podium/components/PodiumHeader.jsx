import { PODIUM_ASSETS } from "../constants/podiumAssets.js"
import {
  HEADER_PLATE_CLASS,
  HEADER_TITLE_CLASS,
  HEADER_WRAP_CLASS,
} from "../constants/podiumLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"

export default function PodiumHeader() {
  return (
    <header className={HEADER_WRAP_CLASS}>
      <PublicAsset src={PODIUM_ASSETS.headerPlate} alt="" className={HEADER_PLATE_CLASS} />
      <h1 className={HEADER_TITLE_CLASS}>명예의 전당</h1>
    </header>
  )
}
