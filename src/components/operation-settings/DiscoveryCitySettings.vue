<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../../services/api'
import type { PlatformOperationSetting } from '../../types'

const cities = ref<PlatformOperationSetting['discovery_cities']>([])
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
async function load() {
  loading.value = true
  try {
    cities.value = (await adminApi.platformOperationSetting()).discovery_cities
    loaded.value = true
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : '城市配置加载失败')
  } finally { loading.value = false }
}
function move(index: number, step: number) {
  const target = index + step
  if (target < 0 || target >= cities.value.length) return
  const city = cities.value.splice(index, 1)[0]!
  cities.value.splice(target, 0, city)
}
async function save() {
  const items = cities.value.map(city => ({ city_code: city.city_code.trim(), city_name: city.city_name.trim() }))
  if (!items.length || items.some(city => !/^[0-9]{6}$/.test(city.city_code) || !city.city_name)) {
    ElMessage.warning('请至少保留一个城市，并填写六位城市编码和名称')
    return
  }
  if (new Set(items.map(city => city.city_code)).size !== items.length || new Set(items.map(city => city.city_name)).size !== items.length) {
    ElMessage.warning('城市编码和名称不能重复')
    return
  }
  saving.value = true
  try {
    cities.value = (await adminApi.updatePlatformOperationSetting({ discovery_cities: items })).discovery_cities
    ElMessage.success('开通城市已保存，已记录审计日志')
  } catch (reason) { ElMessage.error(reason instanceof Error ? reason.message : '城市配置保存失败') }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <el-card class="city-settings" shadow="never" v-loading="loading">
    <template #header>
      <div class="city-heading"><strong>发现页 · 开通城市</strong><el-button :disabled="saving" @click="load">重新加载</el-button></div>
    </template>
    <p>用于用户端首页、达人/活动列表和搜索。第一项为默认浏览城市；不把城市中心作为用户位置。</p>
    <p>使用六位市级行政区划编码（例如邯郸 130400、北京 110100）。移除城市仅关闭发现入口，不删除已有订单或活动。</p>
    <el-table :data="cities" empty-text="暂无城市，请先加载配置">
      <el-table-column label="城市编码" min-width="160"><template #default="{ row }"><el-input v-model="row.city_code" maxlength="6" :disabled="saving" placeholder="130400" /></template></el-table-column>
      <el-table-column label="城市名称" min-width="160"><template #default="{ row }"><el-input v-model="row.city_name" maxlength="50" :disabled="saving" placeholder="邯郸市" /></template></el-table-column>
      <el-table-column label="排序 / 操作" width="230"><template #default="{ $index }">
        <el-button link :disabled="saving || $index === 0" @click="move($index, -1)">上移</el-button>
        <el-button link :disabled="saving || $index === cities.length - 1" @click="move($index, 1)">下移</el-button>
        <el-button link type="danger" :disabled="saving || cities.length <= 1" @click="cities.splice($index, 1)">移除</el-button>
      </template></el-table-column>
    </el-table>
    <div class="city-actions">
      <el-button :disabled="!loaded || saving || cities.length >= 400" @click="cities.push({ city_code: '', city_name: '' })">添加城市</el-button>
      <el-button type="primary" :disabled="!loaded" :loading="saving" @click="save">保存城市配置</el-button>
    </div>
  </el-card>
</template>

<style scoped>
.city-settings { margin-bottom:20px; border-radius:16px; }
.city-heading,.city-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.city-settings p { color:#52666f; font-size:13px; line-height:1.65; }
.city-actions { justify-content:flex-end; margin-top:16px; }
</style>
