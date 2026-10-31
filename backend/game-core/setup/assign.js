// 역할 나누기 파일
// 섞기 + 사람마다 역할 붙이기, 판 만들 때 사용
const { computeRoleComposition } = require('../roleComposition')
const { GAME_ROLES } = require('../core/roles')

// 고르게 섞기 (원본 안 건드리고 새 배열)
function fisherYatesShuffle(items, randomFn) {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}

// 역할 목록 섞어서 사람마다 하나씩
function assignRoles(players, jokerCountOrComposition, randomFn = Math.random) {
    const shuffled = fisherYatesShuffle(players, randomFn)
    const composition =
        typeof jokerCountOrComposition === 'number'
            ? computeRoleComposition(players.length, jokerCountOrComposition)
            : jokerCountOrComposition
    const roles = [
        ...Array(composition.JOKER).fill(GAME_ROLES.JOKER),
        ...Array(composition.DOCTOR).fill(GAME_ROLES.DOCTOR),
        ...Array(composition.GUARD).fill(GAME_ROLES.GUARD),
        ...Array(composition.WITCH_HUNTER).fill(GAME_ROLES.WITCH_HUNTER),
        ...Array(composition.CITIZEN).fill(GAME_ROLES.CITIZEN),
    ]
    return shuffled.map((player, index) => ({ ...player, role: roles[index], alive: true }))
}

module.exports = {
    fisherYatesShuffle,
    assignRoles,
}