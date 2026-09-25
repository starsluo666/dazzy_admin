<script setup lang="ts">
import ActivityCategoriesPanel from './activity/ActivityCategoriesPanel.vue'

defineProps<{ preview: boolean; canManage: boolean }>()
</script>

<template>
  <div class="page activity-section-page">
    <header class="page-heading">
      <div>
        <h1>标签配置</h1>
        <p>维护活动发布、搜索和筛选使用的独立标签</p>
      </div>
    </header>
    <ActivityCategoriesPanel :preview="preview" :can-manage="canManage" />
  </div>
</template>

<style scoped>
.activity-section-page{min-height:calc(100vh - 76px)}
.page-heading{margin-bottom:16px}
</style>
