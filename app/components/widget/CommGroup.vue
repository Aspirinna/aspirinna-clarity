<template>
<BlogWidget
	card
	dim
	title="bilibili"
	bg-img="https://img.aspirinna.cloud/posts/20260811133231829.png"
	bg-aside
>
	<div class="title text-creative">
		脊蕈
	</div>

	<a
		class="bilibili-link"
		href="https://space.bilibili.com/3494364785412496"
		target="_blank"
		rel="noopener noreferrer"
	>
		<Icon name="ant-design:bilibili-filled" />
		<span>访问我的 Bilibili 主页</span>
	</a>
</BlogWidget>
</template>

<style lang="scss" scoped>
.title {
	background-clip: text;
	background-image: linear-gradient(60deg, var(--c-accent) -30%, var(--c-primary), var(--c-text-1));
	background-position: 100% 0;
	background-size: 200%;
	font-size: 1.8em;
	color: transparent;
	transition: background-position 0.2s;

	.blog-widget:hover & {
		background-position: 0 0;
	}
}

.bilibili-link {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 0.9em;
	line-height: 2;
	color: var(--c-text-2);
	transition: color 0.2s;

	&:hover {
		color: var(--c-primary);
	}
}

:deep(.bg-img).bg-img.bg-img {
	opacity: 0.5;
}
</style>
