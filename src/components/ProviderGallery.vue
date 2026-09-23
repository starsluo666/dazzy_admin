<script setup lang="ts">
import { computed } from 'vue'
import type { ProviderMedia } from '../types'

const props = defineProps<{ media?: ProviderMedia[]; cover?: string | null }>()
const items = computed(() => props.media?.length ? props.media : props.cover ? [{ id: 'cover', type: 'image' as const, url: props.cover }] : [])
const images = computed(() => items.value.filter(item => item.type === 'image').map(item => item.url))
</script>

<template>
  <div class="provider-gallery">
    <figure v-for="(item, index) in items" :key="item.id">
      <el-image v-if="item.type === 'image'" :src="item.url" fit="cover" :preview-src-list="images" :initial-index="images.indexOf(item.url)" preview-teleported />
      <video v-else :src="item.url" controls preload="metadata" />
      <figcaption>{{ index + 1 }} · {{ index === 0 ? '列表封面' : item.type === 'video' ? '展示视频' : '生活照' }}</figcaption>
    </figure>
  </div>
</template>

<style scoped>
.provider-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}figure{margin:0;min-width:0}.el-image,video{display:block;width:100%;height:220px;border-radius:10px;background:#edf2f3}figcaption{padding:6px 0;color:#667782;font-size:13px}
</style>
