<script setup lang="ts">
import { orderBy } from 'es-toolkit/array'

const appConfig = useAppConfig()
useSeoMeta({
	title: '标签',
	description: `${appConfig.title}的所有文章标签。`,
})

const { data: listRaw } = await useAsyncData('posts:index', () => getArticleIndexOptions(), { default: () => [] })

const articlesByTag = computed(() => {
	const result: Record<string, any[]> = {}
	const articles = orderBy(listRaw.value, ['date'], ['desc'])
	for (const article of articles) {
		for (const tag of article.tags ?? [])
			(result[tag] ??= []).push(article)
	}
	return result
})

const sortedTags = computed(() =>
	Object.keys(articlesByTag.value).sort((a, b) =>
		(articlesByTag.value[b]?.length || 0) - (articlesByTag.value[a]?.length || 0),
	),
)
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogTech />
</template>

<div class="tags">
	<div v-if="!sortedTags.length" class="empty-state card">
		<Icon name="tabler:tags-off" />
		<p>文章还没有添加标签。</p>
	</div>

	<section v-for="tag in sortedTags" :key="tag" class="tag-group">
		<div class="tag-title">
			<h2 class="tag-name">
				{{ tag }}
			</h2>
			<div class="tag-info">
				<span>{{ articlesByTag[tag]?.length }} 篇</span>
			</div>
		</div>

		<menu class="archive-list">
			<TransitionGroup appear name="float-in">
				<PostArchive
					v-for="article, index in articlesByTag[tag]"
					:key="article.path"
					v-bind="article"
					:to="article.path"
					:style="getFixedDelay(index * 0.03)"
				/>
			</TransitionGroup>
		</menu>
	</section>
</div>
</template>

<style lang="scss" scoped>
.tags {
	padding: 1rem;
	mask-image: linear-gradient(#FFF 50%, #FFF5);
}

.empty-state {
	display: grid;
	place-items: center;
	gap: 0.5rem;
	padding: 3rem 1rem;
	color: var(--c-text-2);

	.iconify {
		font-size: 2rem;
	}
}

.tag-group {
	margin: 1rem 0 3rem;
}

.tag-title {
	display: flex;
	justify-content: space-between;
	gap: 1em;
	position: sticky;
	opacity: 0.5;
	top: 0;
	font-size: min(1.5em, 5vw);
	color: transparent;
	transition: color 0.2s;

	&::selection, :hover > & {
		color: var(--c-text-3);
	}

	> .tag-name {
		margin-bottom: -0.3em;
		mask-image: linear-gradient(#FFF 50%, transparent);
		font-family: var(--font-stroke-free);
		font-size: 3em;
		font-weight: 800;
		line-height: 1;
		z-index: -1;
		-webkit-text-stroke: 1px var(--c-text-3);
	}

	> .tag-info {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		column-gap: 0.5em;
	}
}

.archive-list {
	display: grid;
	margin: 0;
	padding: 0;
}
</style>
