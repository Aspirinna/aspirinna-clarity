<script setup lang="ts">
const appConfig = useAppConfig()
useSeoMeta({
	title: '番剧',
	description: `${appConfig.author.name}的 B站追番列表。`,
})

interface BiliItem {
	season_id: number
	media_id: number
	title: string
	cover: string
	evaluate?: string
	follow_status: number
	total_count?: number
	new_ep?: { index_show?: string }
	badge?: string
}

const statusLabel: Record<number, string> = {
	1: '想看',
	2: '在看',
	3: '看过',
}

const { data } = await useFetch('/api/bilibili', {
	default: () => ({ list: [] as BiliItem[], configured: false, failed: false, message: '' }),
})

const configured = computed(() => data.value?.configured)
const failed = computed(() => data.value?.failed)
const filter = ref(0)
const filteredList = computed(() => {
	const all = data.value?.list ?? []
	return filter.value ? all.filter(item => item.follow_status === filter.value) : all
})

const { page, totalPages, listPaged: list } = usePagination(filteredList, { perPage: 25 })
watch(filter, () => {
	page.value = 1
})

function mediaLink(item: BiliItem) {
	return `https://www.bilibili.com/bangumi/media/md${item.media_id}`
}
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetCommGroup />
</template>

<div class="anime-page">
	<h1 class="anime-heading text-creative">
		番剧
	</h1>

	<div v-if="!configured" class="anime-hint card">
		<Icon name="tabler:brand-bilibili" />
		<p>尚未配置 Bilibili UID。</p>
	</div>

	<div v-else-if="failed" class="anime-hint card">
		<Icon name="tabler:alert-triangle" />
		<p>追番数据获取失败：{{ data.message || '请确认追番列表已公开，或为构建环境配置 Bilibili API 代理。' }}</p>
	</div>

	<template v-else>
		<div class="anime-tabs">
			<ZButton text="全部" :primary="filter === 0" @click="filter = 0" />
			<ZButton text="想看" :primary="filter === 1" @click="filter = 1" />
			<ZButton text="在看" :primary="filter === 2" @click="filter = 2" />
			<ZButton text="看过" :primary="filter === 3" @click="filter = 3" />
		</div>

		<div v-if="list.length" class="anime-grid">
			<UtilLink
				v-for="item in list"
				:key="item.media_id"
				:to="mediaLink(item)"
				class="anime-card"
				:title="item.title"
			>
				<div class="anime-cover">
					<img :src="item.cover" :alt="item.title" referrerpolicy="no-referrer" loading="lazy">
					<span class="anime-status">{{ statusLabel[item.follow_status] ?? '追番' }}</span>
				</div>
				<div class="anime-name">
					{{ item.title }}
				</div>
				<div v-if="item.new_ep?.index_show" class="anime-ep">
					{{ item.new_ep.index_show }}
				</div>
			</UtilLink>
		</div>

		<div v-else class="anime-hint card">
			<Icon name="tabler:movie-off" />
			<p>当前筛选条件下没有番剧。</p>
		</div>

		<ZPagination v-if="totalPages > 1" v-model="page" :total-pages="totalPages" />
	</template>
</div>
</template>

<style lang="scss" scoped>
.anime-page {
	padding: 1rem;
}

.anime-heading {
	margin-bottom: 1rem;
	font-size: 1.5em;
}

.anime-hint {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
	padding: 1rem;
	font-size: 0.9em;
	line-height: 1.6;
	color: var(--c-text-2);

	> .iconify {
		flex-shrink: 0;
		margin-top: 0.2em;
		font-size: 1.3em;
	}

	p {
		margin: 0;
	}
}

.anime-tabs {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 1rem;
}

.anime-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	gap: 0.8rem;
}

.anime-card {
	.anime-cover {
		position: relative;
		overflow: hidden;
		aspect-ratio: 0.72;
		border-radius: 0.5rem;
		box-shadow: var(--box-shadow-2);

		img {
			width: 100%;
			height: 100%;
			transition: transform 0.3s;
			object-fit: cover;
		}

		.anime-status {
			position: absolute;
			inset-inline-start: 0.3rem;
			bottom: 0.3rem;
			padding: 0.1em 0.4em;
			border-radius: 0.3em;
			background-color: var(--c-bg-a80);
			backdrop-filter: blur(4px);
			font-size: 0.72em;
			color: var(--c-primary);
		}
	}

	&:hover .anime-cover img {
		transform: scale(1.05);
	}

	.anime-name {
		display: -webkit-box;
		overflow: hidden;
		margin-top: 0.4rem;
		font-size: 0.8em;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		line-height: 1.3;
		color: var(--c-text-1);
		-webkit-box-orient: vertical;
	}

	.anime-ep {
		margin-top: 0.2rem;
		font-size: 0.72em;
		color: var(--c-text-3);
	}
}
</style>
