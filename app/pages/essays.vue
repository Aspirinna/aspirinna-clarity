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

		<div
			v-if="item.images?.length"
			class="images"
			:class="`count-${item.images.length}`"
		>
			<ContentPic
				v-for="(image, index) in item.images"
				:key="image"
				class="image"
				:src="image"
				:alt="`动态图片 ${index + 1}`"
			/>
		</div>

		<footer class="moment-bottom">
			<div class="moment-tags">
				<span v-for="tag in item.tags" :key="tag" class="tag">
					<Icon name="tabler:hash" />{{ tag }}
				</span>
			</div>

			<span v-if="item.location" class="location">
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
		line-height: 1.8;
		white-space: pre-wrap;
	}

	.images {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;

		&.count-1 {
			grid-template-columns: minmax(0, 62%);
		}

		&.count-2, &.count-4 {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.image {
			margin: 0;

			:deep(figcaption) {
				display: none;
			}

			:deep(img) {
				width: 100%;
				max-height: 70vh;
				border-radius: 0.4rem;
				object-fit: contain;
			}
		}
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		font-size: 0.85em;
		color: var(--c-text-2);
	}
}

.moment-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.5em;
	font-size: 0.8em;
	color: var(--c-text-3);
}

.moment-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5em;

	.tag {
		display: inline-flex;
		align-items: center;
		padding: 0.1em 0.6em;
		border-radius: 1em;
		background-color: var(--c-bg-2);
		color: var(--c-primary);
	}
}

.location {
	display: inline-flex;
	align-items: center;
	gap: 0.1em;
}
</style>
