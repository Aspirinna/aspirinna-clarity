import type { SteamDashboard } from '~/types/steam'

const emptyDashboard: SteamDashboard = {
	configured: false,
	failed: false,
	recentGames: [],
	games: [],
}

export default defineEventHandler(async (event) => {
	const { steamApi } = useRuntimeConfig(event)
	if (!steamApi)
		return emptyDashboard

	try {
		const dashboard = await $fetch<SteamDashboard>(steamApi, {
			retry: 2,
			retryDelay: 1000,
			timeout: 30000,
		})
		return {
			...dashboard,
			configured: true,
			failed: false,
		}
	}
	catch {
		return {
			...emptyDashboard,
			configured: true,
			failed: true,
		}
	}
})
