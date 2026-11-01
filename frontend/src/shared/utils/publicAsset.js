// public 폴더 경로를 img·video 주소로 바꾸기 (앞 / 붙이고 한글을 NFC로 맞춰 인코딩)
// PublicAsset 컴포넌트와 주소를 직접 쓰는 화면(배경 영상·손잡이 등)이 씀
// 같은 이름이 NFC·NFD 두 주소로 갈라지지 않게 NFC 하나로 맞춤
export function publicAsset(path) {
    const withLeadingSlash = path.startsWith("/") ? path : `/${path}`
    const normalized = withLeadingSlash.normalize("NFC")

    return encodeURI(normalized)
}
