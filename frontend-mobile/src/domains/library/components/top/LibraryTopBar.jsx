// 서고 위 줄 (소리 조절만)
// pages/LibraryPage.jsx가 씀
import { getLibraryTab } from "@/domains/library/constants/libraryTabs.js"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

export default function LibraryTopBar({ activeTabId }) {
    const activeTab = getLibraryTab(activeTabId)

    return (
        <header className="relative z-10 flex shrink-0 justify-end px-3 pt-2 land:pt-1">
            <h1 className="sr-only">{activeTab.label}</h1>
            <SoundControl look="library" />
        </header>
    )
}
