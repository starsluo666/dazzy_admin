<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '../services/api'

const emit = defineEmits<{ authenticated: [] }>()
const phone = ref('')
const password = ref('')
const loading = ref(false)
async function login() {
  loading.value = true
  try { await adminApi.login(phone.value, password.value); emit('authenticated') }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '登录失败') }
  finally { loading.value = false }
}
</script>
<template><div class="login-page"><section class="login-brand"><div class="large-symbol">乐</div><h1>乐搭伴运营平台</h1><p>连接每一座城市里的美好相遇</p></section><el-card class="login-card"><h2>欢迎登录</h2><p>使用已开通后台权限的账号登录</p><el-input v-model="phone" size="large" placeholder="手机号" /><el-input v-model="password" size="large" type="password" show-password placeholder="密码" @keyup.enter="login"/><el-button type="primary" size="large" :loading="loading" @click="login">登录运营后台</el-button></el-card></div></template>
