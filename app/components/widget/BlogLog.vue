<script setup lang="ts">
const blogLog = [
	{ label: '2026-08-11', value: '迁移至 Nuxt 4 Clarity 主题' },
]
</script>

<template>
<BlogWidget card title="更新日志">
	<ZDlGroup size="large" :items="blogLog" />
</BlogWidget>
</template>
