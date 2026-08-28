<script setup lang="ts">
import type { SteamDashboard, SteamGame } from '~/types/steam'

const emptyDashboard: SteamDashboard = {
	configured: false,
	failed: false,
	recentGames: [],
	games: [],
}

const appConfig = useAppConfig()
useSeoMeta({
	title: '游戏',
	description: `${appConfig.author.name}的 Steam 游戏资料与游玩记录。`,
})

const { data, status, refresh } = await useFetch<SteamDashboard>('/api/steam', {
	server: false,
	default: () => emptyDashboard,
})

const search = ref('')
const sortedGames = computed(() => [...(data.value?.games ?? [])]
	.filter(game => game.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))
	.sort((a, b) => b.playtimeMinutes - a.playtimeMinutes),
)
const { page, totalPages, listPaged: games } = usePagination(sortedGames, { perPage: 12 })
watch(search, () => {
	page.value = 1
})

function formatPlaytime(minutes = 0) {
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	if (!hours)
		return `${rest} 分钟`
	return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

function storeLink(game: SteamGame) {
	return `https://store.steampowered.com/app/${game.appId}`
}
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogTech />
</template>

<div class="games-page">
	<header class="page-heading">
		<div>
			<h1 class="text-creative">
				Steam 游戏库
			</h1>
			<p v-if="data.updatedAt" class="updated-at">
				数据更新于 <UtilDate :date="data.updatedAt" />
			</p>
		</div>
		<button v-tip="'刷新数据'" class="refresh-button" aria-label="刷新 Steam 数据" :disabled="status === 'pending'" @click="refresh()">
			<Icon name="tabler:refresh" :class="{ spinning: status === 'pending' }" />
		</button>
	</header>

	<div v-if="status === 'pending' && !data.configured" class="state-panel card">
		<Icon class="spinning" name="tabler:loader-2" />
		<p>正在读取 Steam 数据。</p>
	</div>

	<div v-else-if="!data.configured" class="state-panel card">
		<Icon name="tabler:device-gamepad-2" />
		<div>
			<h2>Steam 数据服务尚未配置</h2>
			<p>页面模板已经就绪。接入服务器缓存 API 后，这里会自动显示游戏资料。</p>
		</div>
	</div>

	<div v-else-if="data.failed" class="state-panel card">
		<Icon name="tabler:alert-triangle" />
		<div>
			<h2>Steam 数据暂时不可用</h2>
			<p>服务器没有取得有效数据，请稍后刷新。</p>
		</div>
	</div>

	<template v-else>
		<section v-if="data.profile" class="profile card">
			<img class="profile-avatar" :src="data.profile.avatarFull" :alt="data.profile.personaName" referrerpolicy="no-referrer">
			<div class="profile-main">
				<div class="profile-title">
					<h2>{{ data.profile.personaName }}</h2>
					<UtilLink :to="data.profile.profileUrl" class="profile-link" title="访问 Steam 个人资料">
						<Icon name="tabler:external-link" />
					</UtilLink>
				</div>
				<p>{{ data.profile.statusText || '状态未知' }}</p>
				<div class="profile-meta">
					<span v-if="data.profile.steamLevel !== undefined">Lv. {{ data.profile.steamLevel }}</span>
					<span v-if="data.profile.badgeCount !== undefined">{{ data.profile.badgeCount }} 徽章</span>
					<span v-if="data.profile.xp !== undefined">{{ data.profile.xp }} XP</span>
				</div>
			</div>
		</section>

		<section v-if="data.stats" class="stats" aria-label="Steam 统计">
			<div class="stat-item">
				<strong>{{ data.stats.totalGames }}</strong>
				<span>游戏总数</span>
			</div>
			<div class="stat-item">
				<strong>{{ formatPlaytime(data.stats.totalPlaytimeMinutes) }}</strong>
				<span>总游玩时长</span>
			</div>
			<div class="stat-item">
				<strong>{{ formatPlaytime(data.stats.recentPlaytimeMinutes) }}</strong>
				<span>最近两周</span>
			</div>
		</section>

		<section v-if="data.recentGames.length" class="game-section">
			<div class="section-heading">
				<h2>最近游玩</h2>
				<span>{{ data.recentGames.length }} 款游戏</span>
			</div>
			<div class="recent-grid">
				<UtilLink v-for="game in data.recentGames" :key="game.appId" :to="storeLink(game)" class="game-card card">
					<img v-if="game.headerImageUrl" :src="game.headerImageUrl" :alt="game.name" loading="lazy" referrerpolicy="no-referrer">
					<div v-else class="game-placeholder">
						<Icon name="tabler:device-gamepad-2" />
					</div>
					<div class="game-info">
						<strong>{{ game.name }}</strong>
						<div class="game-meta">
							<span>{{ formatPlaytime(game.playtime2WeeksMinutes) }}</span>
							<span v-if="game.achievements">成就 {{ game.achievements.unlocked }}/{{ game.achievements.total }}</span>
						</div>
					</div>
				</UtilLink>
			</div>
		</section>

		<section class="game-section">
			<div class="section-heading library-heading">
				<div>
					<h2>游戏库</h2>
					<span>按总游玩时长排序</span>
				</div>
				<label class="game-search">
					<Icon name="tabler:search" />
					<input v-model="search" type="search" placeholder="搜索游戏" aria-label="搜索 Steam 游戏">
				</label>
			</div>

			<div v-if="games.length" class="library-grid">
				<UtilLink v-for="game in games" :key="game.appId" :to="storeLink(game)" class="game-card card">
					<img v-if="game.headerImageUrl" :src="game.headerImageUrl" :alt="game.name" loading="lazy" referrerpolicy="no-referrer">
					<div v-else class="game-placeholder">
						<Icon name="tabler:device-gamepad-2" />
					</div>
					<div class="game-info">
						<strong>{{ game.name }}</strong>
						<div class="game-meta">
							<span>{{ formatPlaytime(game.playtimeMinutes) }}</span>
							<UtilDate v-if="game.lastPlayedAt" :date="game.lastPlayedAt" />
						</div>
					</div>
				</UtilLink>
			</div>
			<div v-else class="library-empty">
				没有找到匹配的游戏。
			</div>

			<ZPagination v-if="totalPages > 1" v-model="page" :total-pages="totalPages" />
		</section>
	</template>
</div>
</template>

<style lang="scss" scoped>
.games-page {
	display: grid;
	gap: 1.25rem;
	padding: 1rem;
}

.page-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;

	h1 {
		margin: 0;
		font-size: 1.5em;
	}
}

.updated-at {
	margin: 0.25rem 0 0;
	font-size: 0.8em;
	color: var(--c-text-3);
}

.refresh-button {
	display: grid;
	flex-shrink: 0;
	place-items: center;
	width: 2.4rem;
	height: 2.4rem;
	border: 1px solid var(--c-border);
	border-radius: 0.5rem;
	color: var(--c-text-2);

	&:hover:not(:disabled) {
		background-color: var(--c-bg-soft);
		color: var(--c-primary);
	}
}

.spinning {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.state-panel {
	display: flex;
	align-items: flex-start;
	gap: 1rem;
	padding: 1.25rem;
	color: var(--c-text-2);

	> .iconify {
		flex-shrink: 0;
		font-size: 1.6rem;
		color: var(--c-primary);
	}

	h2, p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.3rem;
		font-size: 1rem;
		color: var(--c-text);
	}
}

.profile {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1rem;
}

.profile-avatar {
	flex-shrink: 0;
	width: 5rem;
	height: 5rem;
	border: 2px solid var(--c-primary);
	border-radius: 0.5rem;
	object-fit: cover;
}

.profile-main {
	min-width: 0;

	p {
		margin: 0.25rem 0;
		color: var(--c-text-2);
	}
}

.profile-title {
	display: flex;
	align-items: center;
	gap: 0.5rem;

	h2 {
		margin: 0;
		font-size: 1.25rem;
	}
}

.profile-link {
	color: var(--c-text-3);

	&:hover {
		color: var(--c-primary);
	}
}

.profile-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	font-size: 0.8em;
	color: var(--c-text-3);

	span {
		padding: 0.15em 0.55em;
		border-radius: 0.4em;
		background-color: var(--c-bg-2);
	}
}

.stats {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	border-block: 1px solid var(--c-border);
}

.stat-item {
	display: grid;
	place-items: center;
	gap: 0.2rem;
	padding: 1rem 0.5rem;
	text-align: center;

	& + & {
		border-inline-start: 1px solid var(--c-border);
	}

	strong {
		font-size: 1.05em;
		color: var(--c-text);
	}

	span {
		font-size: 0.75em;
		color: var(--c-text-3);
	}
}

.game-section {
	display: grid;
	gap: 0.75rem;
}

.section-heading {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 1rem;

	h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	span {
		font-size: 0.8em;
		color: var(--c-text-3);
	}
}

.library-heading > div {
	display: grid;
	gap: 0.2rem;
}

.game-search {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	width: min(15rem, 50%);
	padding: 0.35rem 0.6rem;
	border: 1px solid var(--c-border);
	border-radius: 0.5rem;
	color: var(--c-text-3);

	input {
		width: 100%;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--c-text);
	}
}

.recent-grid, .library-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
	gap: 0.75rem;
}

.game-card {
	overflow: hidden;
	min-width: 0;
	transition: transform 0.2s;

	&:hover {
		transform: translateY(-2px);
	}

	> img, .game-placeholder {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 460 / 215;
		background-color: var(--c-bg-2);
		object-fit: cover;
	}

	.game-placeholder {
		font-size: 2rem;
		color: var(--c-text-3);
	}
}

.game-info {
	display: grid;
	gap: 0.35rem;
	padding: 0.65rem;

	strong {
		overflow: hidden;
		font-size: 0.85em;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}

.game-meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 0.35rem;
	font-size: 0.7em;
	color: var(--c-text-3);
}

.library-empty {
	padding: 2rem 1rem;
	text-align: center;
	color: var(--c-text-3);
}

@media (max-width: $breakpoint-mobile) {
	.stats {
		grid-template-columns: 1fr;
	}

	.stat-item + .stat-item {
		border-block-start: 1px solid var(--c-border);
		border-inline-start: 0;
	}

	.library-heading {
		flex-direction: column;
		align-items: stretch;
	}

	.game-search {
		width: 100%;
	}
}
</style>
