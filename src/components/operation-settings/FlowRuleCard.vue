<script setup lang="ts">
import type { Component } from 'vue'

const props = defineProps<{
  label: string
  modelValue: number
  unit: string
  min: number
  max: number
  step?: number
  help: string
  icon: Component
  selected?: boolean
  risk?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
  select: []
}>()
</script>

<template>
  <article
    class="flow-rule-card"
    :class="{ selected: props.selected, risk: props.risk }"
    role="button"
    tabindex="0"
    @click="emit('select')"
    @keydown.enter="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <span class="rule-title">
      <el-icon><component :is="props.icon" /></el-icon>
      <strong>{{ props.label }}</strong>
    </span>
    <span class="rule-value" @click.stop="emit('select')">
      <el-input-number
        :model-value="props.modelValue"
        :min="props.min"
        :max="props.max"
        :step="props.step || 1"
        @update:model-value="emit('update:modelValue', Number($event))"
        @focus="emit('select')"
      />
      <em>{{ props.unit }}</em>
    </span>
    <small>{{ props.help }}</small>
  </article>
</template>

<style scoped>
.flow-rule-card {
  display: flex;
  flex-direction: column;
  width: 210px;
  min-height: 138px;
  padding: 16px;
  border: 1px solid #14b7bd;
  border-radius: 8px;
  color: #172033;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
}
.flow-rule-card:hover,
.flow-rule-card.selected {
  background: #f6fdfd;
  box-shadow: 0 7px 18px rgb(8 184 189 / 8%);
}
.flow-rule-card.risk { border-color: #eea126; }
.flow-rule-card.risk:hover,
.flow-rule-card.risk.selected {
  background: #fffaf1;
  box-shadow: 0 7px 18px rgb(238 161 38 / 10%);
}
.flow-rule-card:focus-visible { outline: 2px solid rgb(8 181 186 / 28%); outline-offset: 2px; }
.rule-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
}
.rule-title .el-icon { color: #08aeb4; font-size: 21px; }
.risk .rule-title .el-icon { color: #ed9612; }
.rule-title strong { font-weight: 650; }
.rule-value { display: flex; align-items: center; gap: 9px; margin-top: 12px; }
.rule-value :deep(.el-input-number) { width: 126px; }
.rule-value :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px #dce2e8 inset; }
.rule-value :deep(.el-input__inner) { font-size: 14px; }
.rule-value em { color: #303947; font-size: 13px; font-style: normal; }
.flow-rule-card small {
  margin-top: 12px;
  color: #7b8492;
  font-size: 11px;
  line-height: 1.5;
}
</style>
