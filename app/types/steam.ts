export interface SteamProfile {
	steamId: string
	personaName: string
	profileUrl: string
	avatarFull: string
	statusText?: string
	lastOnline?: string
	steamLevel?: number
	badgeCount?: number
	xp?: number
}

export interface SteamGame {
	appId: number
	name: string
	headerImageUrl?: string
	playtimeMinutes: number
	playtime2WeeksMinutes?: number
	lastPlayedAt?: string
	achievements?: {
		unlocked: number
		total: number
	}
}

export interface SteamStats {
	totalGames: number
	totalPlaytimeMinutes: number
	recentPlaytimeMinutes: number
}

export interface SteamDashboard {
	configured: boolean
	failed: boolean
	stale?: boolean
	updatedAt?: string
	profile?: SteamProfile
	stats?: SteamStats
	recentGames: SteamGame[]
	games: SteamGame[]
}
