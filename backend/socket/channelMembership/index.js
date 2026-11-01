// 채널 소속 입구
// 제외 목록·채널 방송·채널 떼기를 묶어 내보냄, socket gameSession·matchmaking·시험이 폴더 이름으로 부름
const { MAX_CHANNEL_LEAVE_ATTEMPTS, CHANNEL_EXCLUSION_ALARM_ENTRIES } = require('./constants')
const {
    createChannelExclusionOwner,
    excludeSocketFromChannel,
    releaseChannelExclusion,
    releaseSocketFromAllChannels,
    getChannelExclusions,
    isSocketExcludedFromChannel,
    __resetChannelExclusionsForTests,
} = require('./exclusions')
const { emitToChannel } = require('./emit')
const { detachSocketFromChannel } = require('./detach')

module.exports = {
    detachSocketFromChannel,
    emitToChannel,
    createChannelExclusionOwner,
    excludeSocketFromChannel,
    releaseChannelExclusion,
    releaseSocketFromAllChannels,
    getChannelExclusions,
    isSocketExcludedFromChannel,
    MAX_CHANNEL_LEAVE_ATTEMPTS,
    CHANNEL_EXCLUSION_ALARM_ENTRIES,
    __resetChannelExclusionsForTests,
}
