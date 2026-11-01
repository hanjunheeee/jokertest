// 채널 전달 제외 목록 파일
// 채널별·소켓별 제외 기록(주인마다 따로) + 넘치면 경보, 채널 방송·채널 떼기가 씀
const { isNonEmptyString } = require('../common/shape')
const { getOrCreate } = require('../common/maps')
const { DEFAULT_EXCLUSION_OWNER, CHANNEL_EXCLUSION_ALARM_ENTRIES } = require('./constants')

// channelId → socketId → 제외 건 주인들
const channelExclusions = new Map()

let exclusionOwnerSeq = 0
let channelExclusionCount = 0
let channelExclusionAlarmRaised = false

// 제외 주인 이름 새로 뽑기 (떼기 작업마다 하나)
function createChannelExclusionOwner(label = 'owner') {
    exclusionOwnerSeq += 1
    return `${label}#${exclusionOwnerSeq}`
}

// 채널 전달에서 이 소켓 빼기 (주인마다 따로 세서, 다른 주인이 풀어도 남음)
function excludeSocketFromChannel(channelId, socketId, owner = DEFAULT_EXCLUSION_OWNER) {
    if (!isNonEmptyString(channelId)) return
    if (!isNonEmptyString(socketId)) return
    const bySocket = getOrCreate(channelExclusions, channelId, () => new Map())
    const owners = getOrCreate(bySocket, socketId, () => new Set())
    if (owners.has(owner)) return
    owners.add(owner)
    channelExclusionCount += 1
    if (!channelExclusionAlarmRaised && channelExclusionCount > CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        channelExclusionAlarmRaised = true
        console.error('[채널 전달 제외 수위 초과]', {
            code: 'CHANNEL_EXCLUSION_OVER_CAPACITY',
            entries: channelExclusionCount,
            alarmAt: CHANNEL_EXCLUSION_ALARM_ENTRIES,
        })
    }
}

// 수위 아래로 내려오면 경보 다시 켤 수 있게
function rearmExclusionAlarm() {
    if (channelExclusionAlarmRaised && channelExclusionCount <= CHANNEL_EXCLUSION_ALARM_ENTRIES) {
        channelExclusionAlarmRaised = false
    }
}

// 이 주인이 건 제외만 풀기 (주인 없어진 소켓·채널 칸은 지움)
function releaseChannelExclusion(channelId, socketId, owner = DEFAULT_EXCLUSION_OWNER) {
    const bySocket = channelExclusions.get(channelId)
    const owners = bySocket?.get(socketId)
    if (!owners || !owners.delete(owner)) return
    channelExclusionCount -= 1
    if (owners.size === 0) bySocket.delete(socketId)
    if (bySocket.size === 0) channelExclusions.delete(channelId)
    rearmExclusionAlarm()
}

// 연결 끊긴 소켓의 제외 전부 풀기 (모든 채널에서)
function releaseSocketFromAllChannels(socketId) {
    if (!isNonEmptyString(socketId)) return
    for (const [channelId, bySocket] of [...channelExclusions]) {
        const owners = bySocket.get(socketId)
        if (!owners) continue
        channelExclusionCount -= owners.size
        bySocket.delete(socketId)
        if (bySocket.size === 0) channelExclusions.delete(channelId)
    }
    rearmExclusionAlarm()
}

function getChannelExclusions(channelId) {
    const bySocket = channelExclusions.get(channelId)
    return bySocket ? [...bySocket.keys()] : []
}

function isSocketExcludedFromChannel(channelId, socketId) {
    return (channelExclusions.get(channelId)?.get(socketId)?.size ?? 0) > 0
}

function __resetChannelExclusionsForTests() {
    channelExclusions.clear()
    channelExclusionCount = 0
}

module.exports = {
    createChannelExclusionOwner,
    excludeSocketFromChannel,
    releaseChannelExclusion,
    releaseSocketFromAllChannels,
    getChannelExclusions,
    isSocketExcludedFromChannel,
    __resetChannelExclusionsForTests,
}
