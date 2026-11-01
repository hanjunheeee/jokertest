// 요청 모양 검사 파일
// payload가 객체인지·빈 문자열 아닌지·허용 키만 있는지, socket 핸들러들이 같이 씀

// 객체인지 (null·배열은 거절)
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 비지 않은 문자열인지
function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0
}

// 허용 목록 밖 키가 하나라도 있으면 거절 (조작된 키 끼워 넣기 막기)
function hasOnlyKeys(value, allowedKeys) {
    const allowed = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys)
    return Object.keys(value).every((key) => allowed.has(key))
}

module.exports = { isPlainObject, isNonEmptyString, hasOnlyKeys }
