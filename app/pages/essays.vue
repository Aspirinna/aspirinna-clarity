<script setup lang="ts">
import ContentPic from '~/components/content/Pic.vue'
import { moments } from '~/moments'

const appConfig = useAppConfig()

useSeoMeta({
	title: '即刻',
	description: `${appConfig.author.name}的日常动态。`,
})

const list = computed(() =>
	[...moments].sort(
		(a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
	),
)
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetCommGroup />
</template>

<section class="moments-page">
	<h1>即刻</h1>

	<article v-for="item in list" :key="item.createdAt" class="moment card">
		<header>
			<UtilImg
				class="avatar"
				:src="appConfig.author.avatar"
				:alt="appConfig.author.name"
			/>
			<div>
				<strong>{{ appConfig.author.name }}</strong>
				<UtilDate :date="item.createdAt" />
			</div>
		</header>

		<p class="content">
			{{ item.content }}
		</p>

		<div v-if="item.images?.length" class="images">
			<ContentPic
				v-for="(image, index) in item.images"
				:key="image"
				:src="image"
				:alt="`动态图片 ${index + 1}`"
			/>
		</div>

		<footer>
			<span v-for="tag in item.tags" :key="tag">
				#{{ tag }}
			</span>
			<span v-if="item.location">
				<Icon name="tabler:map-pin" />{{ item.location }}
			</span>
		</footer>
	</article>
</section>
</template>

<style scoped lang="scss">
.moments-page {
	display: grid;
	gap: 1rem;
	padding: 1rem;
}

.moment {
	padding: 1rem;

	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.avatar {
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
	}

	.content {
		white-space: pre-wrap;
		line-height: 1.8;
	}

	.images {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		color: var(--c-text-2);
		font-size: 0.85em;
	}
}
</style>
