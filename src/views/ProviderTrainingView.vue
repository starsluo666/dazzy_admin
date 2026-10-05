<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import type { ProviderTrainingSetting, TrainingCurriculum } from '../types'

const props = defineProps<{ preview: boolean }>()
const loading = ref(false)
const saving = ref(false)
const failed = ref(false)
const revision = ref(0)
const published = ref<ProviderTrainingSetting['published']>(null)
const draft = ref<TrainingCurriculum>({ title: '首次接单学习', pass_score: 100, lessons: [], questions: [] })
const saved = ref('')
const dirty = computed(() => JSON.stringify(draft.value) !== saved.value)
const disabled = computed(() => props.preview || loading.value || saving.value || failed.value)
function apply(value: ProviderTrainingSetting) {
  revision.value = value.revision
  published.value = value.published
  draft.value = value.draft
  saved.value = JSON.stringify(value.draft)
}
async function load() {
  if (props.preview) { saved.value = JSON.stringify(draft.value); return }
  loading.value = true
  failed.value = false
  try { apply(await adminApi.providerTraining()) }
  catch (error) { failed.value = true; ElMessage.error(error instanceof Error ? error.message : '学习配置加载失败') }
  finally { loading.value = false }
}
function addLesson() {
  draft.value.lessons.push({ id: crypto.randomUUID(), title: '', content: '' })
}
function addQuestion() {
  draft.value.questions.push({ id: crypto.randomUUID(), title: '', options: ['', '', '', ''], correct_index: 0, explanation: '' })
}
async function remove(kind: 'lessons' | 'questions', index: number) {
  try {
    await ElMessageBox.confirm('仅从当前草稿移除，已发布版本保持不变，重新发布后才生效。', '移除内容', { type: 'warning' })
    if (kind === 'lessons') draft.value.lessons.splice(index, 1)
    else draft.value.questions.splice(index, 1)
  } catch { /* cancelled */ }
}
function move(kind: 'lessons' | 'questions', index: number, offset: number) {
  if (kind === 'lessons') moveItem(draft.value.lessons, index, offset)
  else moveItem(draft.value.questions, index, offset)
}
function moveItem<T>(values: T[], index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= values.length) return
  const [item] = values.splice(index, 1)
  if (item) values.splice(target, 0, item)
}
function removeOption(question: TrainingCurriculum['questions'][number], index: number) {
  question.options.splice(index, 1)
  if (question.correct_index === index) question.correct_index = -1
  else if (question.correct_index > index) question.correct_index -= 1
}
async function save() {
  if (disabled.value) return
  if (draft.value.questions.some(question => question.correct_index < 0)) {
    ElMessage.warning('请为每道题选择正确答案')
    return
  }
  saving.value = true
  try { apply(await adminApi.saveProviderTraining(revision.value, draft.value)); ElMessage.success('草稿已保存，发布后达人端才会更新') }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败') }
  finally { saving.value = false }
}
async function publish() {
  if (disabled.value || dirty.value) return
  try {
    await ElMessageBox.confirm('新版本发布后，尚未通过考核的达人需按新资料学习答题。已通过考核或上线前已接过单的达人无需重复考核。', '确认发布接单学习', { type: 'warning', confirmButtonText: '确认发布' })
  } catch { return }
  saving.value = true
  try { apply(await adminApi.publishProviderTraining(revision.value)); ElMessage.success('学习资料与题目已发布') }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '发布失败') }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <div v-loading="loading" class="training-settings">
    <header class="training-header"><div><h1>接单学习</h1><p>管理首次接单的学习资料和考核题目。保存草稿不会影响正在学习的达人。</p></div><el-button v-if="failed" @click="load">重新加载</el-button></header>
    <el-alert v-if="!published" title="尚未发布学习内容，新达人暂不能开启在线接单。请先添加资料和题目，再发布。" type="warning" :closable="false" show-icon />
    <el-alert v-else :title="`已发布版本 ${published.version_id} · ${published.lesson_count} 篇资料 · ${published.question_count} 道题目 · ${published.pass_score} 分通过`" type="success" :closable="false" show-icon />
    <el-form label-position="top" :disabled="disabled" class="training-form">
      <section class="settings-card"><h2>考核规则</h2><div class="rules-row"><el-form-item label="学习名称"><el-input v-model="draft.title" maxlength="80" /></el-form-item><el-form-item label="通过分数（默认全部答对）"><el-input-number v-model="draft.pass_score" :min="1" :max="100" :precision="0" /></el-form-item></div><p class="help">单选题等权计分；未通过可重新作答。已通过的达人无需因后续内容更新再次考核。</p></section>
      <section class="settings-card">
        <div class="section-head"><h2>学习资料 <small>{{ draft.lessons.length }}/30</small></h2><el-button :disabled="disabled || draft.lessons.length >= 30" @click="addLesson">新增学习资料</el-button></div>
        <p class="help">填写达人需要了解的服务规范、接单流程等内容。支持分段文字，按下方顺序展示。</p>
        <el-empty v-if="!draft.lessons.length" description="暂无学习资料" :image-size="64" />
        <div v-for="(lesson, index) in draft.lessons" :key="lesson.id" class="editor-card">
          <div class="editor-head"><strong>资料 {{ index + 1 }}</strong><div><el-button text :disabled="disabled || index === 0" @click="move('lessons', index, -1)">上移</el-button><el-button text :disabled="disabled || index === draft.lessons.length - 1" @click="move('lessons', index, 1)">下移</el-button><el-button text type="danger" @click="remove('lessons', index)">移除</el-button></div></div>
          <el-form-item label="资料标题"><el-input v-model="lesson.title" maxlength="80" placeholder="例如：接单与出发须知" /></el-form-item>
          <el-form-item label="学习内容"><el-input v-model="lesson.content" type="textarea" :autosize="{ minRows: 5, maxRows: 18 }" maxlength="10000" show-word-limit placeholder="填写完整的学习内容，可分段说明" /></el-form-item>
        </div>
      </section>
      <section class="settings-card">
        <div class="section-head"><h2>考核题目 <small>{{ draft.questions.length }}/50</small></h2><el-button :disabled="disabled || draft.questions.length >= 50" @click="addQuestion">新增题目</el-button></div>
        <p class="help">每题只有一个正确答案；判断题可使用两个选项。正确答案不会提前发送到达人端。</p>
        <el-empty v-if="!draft.questions.length" description="暂无考核题目" :image-size="64" />
        <div v-for="(question, index) in draft.questions" :key="question.id" class="editor-card">
          <div class="editor-head"><strong>题目 {{ index + 1 }}</strong><div><el-button text :disabled="disabled || index === 0" @click="move('questions', index, -1)">上移</el-button><el-button text :disabled="disabled || index === draft.questions.length - 1" @click="move('questions', index, 1)">下移</el-button><el-button text type="danger" @click="remove('questions', index)">移除</el-button></div></div>
          <el-form-item label="题干"><el-input v-model="question.title" type="textarea" :rows="2" maxlength="500" /></el-form-item>
          <el-form-item label="选项与正确答案"><div class="options-editor"><div v-for="(_, optionIndex) in question.options" :key="optionIndex" class="option-row"><el-radio v-model="question.correct_index" :value="optionIndex">{{ String.fromCharCode(65 + optionIndex) }}</el-radio><el-input v-model="question.options[optionIndex]" maxlength="300" placeholder="填写选项内容" /><el-button text type="danger" :disabled="question.options.length <= 2" @click="removeOption(question, optionIndex)">移除</el-button></div><el-button :disabled="question.options.length >= 6" @click="question.options.push('')">添加选项</el-button></div></el-form-item>
          <el-form-item label="答案说明（运营内部留存）"><el-input v-model="question.explanation" type="textarea" :rows="2" maxlength="1000" placeholder="选填，说明该题的依据，便于运营维护" /></el-form-item>
        </div>
      </section>
    </el-form>
    <footer class="training-footer"><span>{{ props.preview ? '预览模式不可保存' : dirty ? '有未保存的修改' : '草稿已同步' }}</span><div><el-button :disabled="disabled || !dirty" :loading="saving" @click="save">保存草稿</el-button><el-button type="primary" :disabled="disabled || dirty || !draft.lessons.length || !draft.questions.length" :loading="saving" @click="publish">发布学习内容</el-button></div></footer>
  </div>
</template>

<style scoped>
.training-settings { max-width: 1120px; margin: 0 auto; padding-bottom: 24px; }
.training-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.training-header h1 { margin: 0 0 8px; font-size: 26px; }
.training-header p, .help { color: #637477; line-height: 1.65; font-size: 14px; }
.settings-card { margin: 20px 0; padding: 24px; border: 1px solid #e2e9e9; border-radius: 16px; background: #fff; }
.section-head, .editor-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.settings-card h2 { margin: 0 0 16px; font-size: 18px; }
.section-head h2 { margin: 0; }
.settings-card small { margin-left: 8px; color: #748789; font-size: 13px; font-weight: 400; }
.rules-row { display: grid; grid-template-columns: minmax(0,1fr) 260px; gap: 24px; }
.editor-card { margin-top: 20px; padding: 20px; border: 1px solid #e5ecec; border-radius: 12px; background: #f9fbfb; }
.editor-head { margin-bottom: 16px; }
.options-editor { width: 100%; }
.option-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.option-row .el-radio { flex: 0 0 48px; margin-right: 0; }
.training-footer { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 20px 24px; border: 1px solid #dce6e6; border-radius: 16px; background: rgba(255,255,255,.97); box-shadow: 0 -4px 20px rgba(30,60,60,.04); }
.training-footer span { color: #637477; font-size: 14px; }
@media(max-width: 760px) { .rules-row { grid-template-columns: 1fr; gap: 0; } .settings-card { padding: 16px; } }
</style>
