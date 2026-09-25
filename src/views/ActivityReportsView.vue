<script setup lang="ts">
import ActivityReportsPanel from './activity/ActivityReportsPanel.vue'

defineProps<{ preview: boolean; canManage: boolean }>()
</script>

<template>
  <div class="page activity-section-page">
    <header class="page-heading">
      <div>
        <h1>举报与处置</h1>
        <p>集中核查活动内容、发起人行为及线下安全问题</p>
      </div>
    </header>
    <ActivityReportsPanel :preview="preview" :can-manage="canManage" />
  </div>
</template>

<style scoped>
.activity-section-page{min-height:calc(100vh - 76px)}
.page-heading{margin-bottom:16px}
</style>
