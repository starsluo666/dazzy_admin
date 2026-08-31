<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Close,
  CopyDocument,
  EditPen,
  Key,
  Lock,
  OfficeBuilding,
  Plus,
  Refresh,
  Search,
  UserFilled,
} from '@element-plus/icons-vue'
import { adminApi } from '../services/api'
import type {
  AdminOrganization,
  AdminOrganizationMember,
  AdminPermissionGroup,
  AdminRole,
  AdminRoleDataScope,
} from '../types'

type SystemTab = 'members' | 'roles'

const emit = defineEmits<{ 'open-audit': [] }>()
const activeTab = ref<SystemTab>('members')
const loading = ref(false)
const saving = ref(false)
const organizations = ref<AdminOrganization[]>([])
const roles = ref<AdminRole[]>([])
const members = ref<AdminOrganizationMember[]>([])
const permissionGroups = ref<AdminPermissionGroup[]>([])
const dataScopes = ref<Array<{ value: AdminRoleDataScope; label: string }>>([])
const memberSummary = ref({ total: 0, active: 0, inactive: 0, organizations: 0 })
const roleSummary = ref({ total: 0, system: 0, custom: 0 })

const memberFilters = reactive<{
  search: string
  organization: number | ''
  role: number | ''
  status: '' | 'active' | 'inactive'
}>({ search: '', organization: '', role: '', status: '' })
const roleFilters = reactive({ search: '', organization: '' as number | '' })

const memberDrawerVisible = ref(false)
const editingMember = ref<AdminOrganizationMember | null>(null)
const memberForm = reactive({
  phone: '',
  organization: '' as number | '',
  role: '' as number | '',
  city_codes: [] as string[],
  is_active: true,
})

const roleDrawerVisible = ref(false)
const editingRole = ref<AdminRole | null>(null)
const copySource = ref<AdminRole | null>(null)
const roleForm = reactive({
  organization: '' as number | '',
  name: '',
  code: '',
  permissions: [] as string[],
  data_scope: 'organization' as AdminRoleDataScope,
})

const totalPermissions = computed(() => permissionGroups.value.reduce(
  (total, group) => total + group.permissions.length,
  0,
))
const visibleRoles = computed(() => {
  const keyword = roleFilters.search.trim().toLowerCase()
  return roles.value.filter((role) => {
    const matchesOrganization = !roleFilters.organization
      || role.organization === roleFilters.organization
      || role.organization === null
    const matchesKeyword = !keyword
      || role.name.toLowerCase().includes(keyword)
      || role.code.toLowerCase().includes(keyword)
    return matchesOrganization && matchesKeyword
  })
})
const memberRoleOptions = computed(() => roles.value.filter((role) => (
  !memberForm.organization
  || role.organization === null
  || role.organization === memberForm.organization
)))
const selectedMemberRole = computed(() => roles.value.find((role) => role.id === memberForm.role))
const selectedRoleOrganization = computed(() => organizations.value.find((item) => item.id === roleForm.organization))
const drawerTitle = computed(() => editingMember.value ? '编辑后台账号' : '添加后台账号')
const roleDrawerTitle = computed(() => editingRole.value
  ? '编辑角色'
  : copySource.value
    ? '复制角色'
    : '新建角色')

function formatDateTime(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}

function permissionName(code: string) {
  for (const group of permissionGroups.value) {
    const permission = group.permissions.find((item) => item.code === code)
    if (permission) return permission.label
  }
  return code
}

function roleTagType(role: AdminRole) {
  return role.is_system ? 'info' : 'primary'
}

function resetMemberFilters() {
  Object.assign(memberFilters, { search: '', organization: '', role: '', status: '' })
  loadMembers()
}

function resetRoleFilters() {
  Object.assign(roleFilters, { search: '', organization: '' })
}

async function loadBase() {
  const [organizationData, permissionData] = await Promise.all([
    adminApi.organizations(),
    adminApi.permissionCatalog(),
  ])
  organizations.value = organizationData.items
  permissionGroups.value = permissionData.groups
  dataScopes.value = permissionData.data_scopes
}

async function loadRoles() {
  const data = await adminApi.adminRoles()
  roles.value = data.items
  roleSummary.value = data.summary
}

async function loadMembers() {
  const data = await adminApi.organizationMembers({ ...memberFilters })
  members.value = data.items
  memberSummary.value = data.summary
}

async function load() {
  loading.value = true
  try {
    await loadBase()
    await Promise.all([loadRoles(), loadMembers()])
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '系统管理数据加载失败')
  } finally {
    loading.value = false
  }
}

function switchTab(tab: SystemTab) {
  activeTab.value = tab
}

function openMemberCreate() {
  editingMember.value = null
  Object.assign(memberForm, {
    phone: '',
    organization: organizations.value[0]?.id || '',
    role: '',
    city_codes: [],
    is_active: true,
  })
  memberDrawerVisible.value = true
}

function openMemberEdit(member: AdminOrganizationMember) {
  if (member.is_self) {
    ElMessage.warning('为避免锁定当前账号，不能修改自己的角色、状态或数据范围')
    return
  }
  editingMember.value = member
  Object.assign(memberForm, {
    phone: member.phone,
    organization: member.organization,
    role: member.role,
    city_codes: [...member.city_codes],
    is_active: member.is_active,
  })
  memberDrawerVisible.value = true
}

function changeMemberOrganization() {
  if (!memberRoleOptions.value.some((role) => role.id === memberForm.role)) memberForm.role = ''
}

async function saveMember() {
  if (!editingMember.value && !/^1\d{10}$/.test(memberForm.phone)) {
    ElMessage.warning('请输入已注册用户的 11 位手机号')
    return
  }
  if (!memberForm.organization || !memberForm.role) {
    ElMessage.warning('请选择所属组织和角色')
    return
  }
  if (selectedMemberRole.value?.data_scope === 'city' && memberForm.city_codes.length === 0) {
    ElMessage.warning('指定城市角色至少需要填写一个城市编码')
    return
  }
  saving.value = true
  try {
    const payload = {
      role: Number(memberForm.role),
      city_codes: memberForm.city_codes,
      is_active: memberForm.is_active,
    }
    if (editingMember.value) {
      await adminApi.updateOrganizationMember(editingMember.value.id, payload)
    } else {
      await adminApi.createOrganizationMember({
        ...payload,
        phone: memberForm.phone,
        organization: Number(memberForm.organization),
      })
    }
    memberDrawerVisible.value = false
    await Promise.all([loadMembers(), loadRoles()])
    ElMessage.success(`${editingMember.value ? '账号设置已更新' : '后台账号已添加'}，操作已写入审计日志`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '后台账号保存失败')
  } finally {
    saving.value = false
  }
}

function roleCodeFromName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
}

function openRoleCreate() {
  editingRole.value = null
  copySource.value = null
  Object.assign(roleForm, {
    organization: organizations.value[0]?.id || '',
    name: '',
    code: '',
    permissions: [],
    data_scope: 'organization',
  })
  roleDrawerVisible.value = true
}

function openRoleEdit(role: AdminRole) {
  if (role.is_system) {
    ElMessage.info('系统角色不可修改，可以复制后创建自定义角色')
    return
  }
  editingRole.value = role
  copySource.value = null
  Object.assign(roleForm, {
    organization: role.organization || organizations.value[0]?.id || '',
    name: role.name,
    code: role.code,
    permissions: [...role.permissions],
    data_scope: role.data_scope,
  })
  roleDrawerVisible.value = true
}

function openRoleCopy(role: AdminRole) {
  editingRole.value = null
  copySource.value = role
  Object.assign(roleForm, {
    organization: role.organization || organizations.value[0]?.id || '',
    name: `${role.name}副本`,
    code: `${role.code}-copy`,
    permissions: [...role.permissions],
    data_scope: role.data_scope,
  })
  roleDrawerVisible.value = true
}

function changeRoleName() {
  if (!editingRole.value && !copySource.value && !roleForm.code) roleForm.code = roleCodeFromName(roleForm.name)
}

function changeRoleOrganization() {
  if (selectedRoleOrganization.value?.organization_type !== 'platform' && roleForm.data_scope === 'all') {
    roleForm.data_scope = 'organization'
  }
}

function groupPermissionCodes(group: AdminPermissionGroup) {
  return group.permissions.map((permission) => permission.code)
}

function groupCheckedCount(group: AdminPermissionGroup) {
  return groupPermissionCodes(group).filter((code) => roleForm.permissions.includes(code)).length
}

function groupIsChecked(group: AdminPermissionGroup) {
  return groupCheckedCount(group) === group.permissions.length
}

function groupIsIndeterminate(group: AdminPermissionGroup) {
  const count = groupCheckedCount(group)
  return count > 0 && count < group.permissions.length
}

function togglePermissionGroup(group: AdminPermissionGroup, checked: boolean) {
  const groupCodes = groupPermissionCodes(group)
  roleForm.permissions = checked
    ? Array.from(new Set([...roleForm.permissions, ...groupCodes]))
    : roleForm.permissions.filter((code) => !groupCodes.includes(code))
}

async function saveRole() {
  if (!roleForm.organization || !roleForm.name.trim() || !roleForm.code.trim()) {
    ElMessage.warning('请完整填写所属组织、角色名称和角色编码')
    return
  }
  if (!/^[a-z0-9_-]+$/.test(roleForm.code)) {
    ElMessage.warning('角色编码仅支持小写字母、数字、连字符和下划线')
    return
  }
  if (roleForm.permissions.length === 0) {
    ElMessage.warning('请至少选择一项功能权限')
    return
  }
  saving.value = true
  try {
    const payload = {
      organization: Number(roleForm.organization),
      name: roleForm.name.trim(),
      code: roleForm.code.trim(),
      permissions: roleForm.permissions,
      data_scope: roleForm.data_scope,
    }
    if (editingRole.value) await adminApi.updateAdminRole(editingRole.value.id, payload)
    else await adminApi.createAdminRole(payload)
    roleDrawerVisible.value = false
    await Promise.all([loadRoles(), loadMembers()])
    ElMessage.success(`${editingRole.value ? '角色已更新' : '角色已创建'}，操作已写入审计日志`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '角色保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteRole(role: AdminRole) {
  try {
    await ElMessageBox.confirm(
      `确认删除角色“${role.name}”？删除后无法恢复。`,
      '删除角色',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
    await adminApi.deleteAdminRole(role.id)
    await loadRoles()
    ElMessage.success('角色已删除，操作已写入审计日志')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '角色删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="page system-management-page" v-loading="loading">
    <header class="page-heading system-heading">
      <div><h1>系统管理</h1><p>统一维护后台账号、角色权限与数据范围，所有变更均写入操作审计</p></div>
      <div class="heading-actions">
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="activeTab === 'members'" type="primary" :icon="Plus" @click="openMemberCreate">添加后台账号</el-button>
        <el-button v-else type="primary" :icon="Plus" @click="openRoleCreate">新建角色</el-button>
      </div>
    </header>

    <nav class="system-tabs" aria-label="系统管理模块">
      <button :class="{ active: activeTab === 'members' }" @click="switchTab('members')"><el-icon><UserFilled /></el-icon>后台账号 <b>{{ memberSummary.total }}</b></button>
      <button :class="{ active: activeTab === 'roles' }" @click="switchTab('roles')"><el-icon><Key /></el-icon>角色权限 <b>{{ roleSummary.total }}</b></button>
      <button class="audit-link" @click="emit('open-audit')">查看操作审计 →</button>
    </nav>

    <section class="system-metrics" aria-label="账号权限概况">
      <article><el-icon class="cyan"><UserFilled /></el-icon><div><span>后台账号</span><strong>{{ memberSummary.total }}</strong><small>覆盖 {{ memberSummary.organizations }} 个组织</small></div></article>
      <article><el-icon class="green"><CircleCheck /></el-icon><div><span>启用中</span><strong>{{ memberSummary.active }}</strong><small>{{ memberSummary.inactive }} 个已停用</small></div></article>
      <article><el-icon class="purple"><Key /></el-icon><div><span>自定义角色</span><strong>{{ roleSummary.custom }}</strong><small>{{ roleSummary.system }} 个系统角色</small></div></article>
      <article><el-icon class="blue"><OfficeBuilding /></el-icon><div><span>管理组织</span><strong>{{ organizations.length }}</strong><small>按组织隔离数据</small></div></article>
    </section>

    <section v-if="activeTab === 'members'" class="system-panel">
      <header class="member-filters">
        <el-input v-model="memberFilters.search" clearable :prefix-icon="Search" placeholder="姓名 / 手机号 / 角色" @keyup.enter="loadMembers" />
        <el-select v-model="memberFilters.organization" clearable placeholder="所属组织" @change="memberFilters.role = ''">
          <el-option v-for="organization in organizations" :key="organization.id" :label="organization.name" :value="organization.id" />
        </el-select>
        <el-select v-model="memberFilters.role" clearable placeholder="账号角色">
          <el-option v-for="role in roles.filter((item) => !memberFilters.organization || item.organization === null || item.organization === memberFilters.organization)" :key="role.id" :label="role.name" :value="role.id" />
        </el-select>
        <el-select v-model="memberFilters.status" clearable placeholder="账号状态">
          <el-option label="启用中" value="active" /><el-option label="已停用" value="inactive" />
        </el-select>
        <el-button @click="resetMemberFilters">重置</el-button><el-button type="primary" @click="loadMembers">查询</el-button>
      </header>

      <el-table :data="members" height="calc(100vh - 415px)" empty-text="当前筛选条件下没有后台账号">
        <el-table-column label="后台账号" min-width="180">
          <template #default="scope"><div class="member-cell"><el-avatar :size="38">{{ scope.row.user_name.slice(0, 1) }}</el-avatar><div><strong>{{ scope.row.user_name }} <el-tag v-if="scope.row.is_self" size="small" effect="plain">当前账号</el-tag></strong><span>{{ scope.row.phone }}</span></div></div></template>
        </el-table-column>
        <el-table-column label="所属组织" min-width="150"><template #default="scope"><div class="two-line-cell"><strong>{{ scope.row.organization_name }}</strong><span>{{ scope.row.user_public_id.slice(0, 8) }}</span></div></template></el-table-column>
        <el-table-column label="角色" min-width="135"><template #default="scope"><el-tag :type="scope.row.is_system_role ? 'info' : 'primary'" effect="plain">{{ scope.row.role_name }}</el-tag></template></el-table-column>
        <el-table-column label="数据范围" min-width="135"><template #default="scope"><div class="two-line-cell"><strong>{{ scope.row.data_scope_label }}</strong><span v-if="scope.row.city_codes.length">{{ scope.row.city_codes.join('、') }}</span><span v-else>跟随角色配置</span></div></template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="scope"><span :class="['state-copy', scope.row.is_active ? 'active' : 'inactive']"><i></i>{{ scope.row.is_active ? '启用中' : '已停用' }}</span></template></el-table-column>
        <el-table-column label="更新时间" width="165"><template #default="scope">{{ formatDateTime(scope.row.updated_at) }}</template></el-table-column>
        <el-table-column label="操作" width="92" fixed="right"><template #default="scope"><el-button link type="primary" :disabled="scope.row.is_self" @click="openMemberEdit(scope.row)">编辑设置</el-button></template></el-table-column>
      </el-table>
      <footer class="system-footer"><span>共 {{ members.length }} 个后台账号</span><span><el-icon><Lock /></el-icon> 当前登录账号不可修改自身权限</span></footer>
    </section>

    <section v-else class="system-panel">
      <header class="role-filters">
        <el-input v-model="roleFilters.search" clearable :prefix-icon="Search" placeholder="角色名称 / 编码" />
        <el-select v-model="roleFilters.organization" clearable placeholder="所属组织">
          <el-option v-for="organization in organizations" :key="organization.id" :label="organization.name" :value="organization.id" />
        </el-select>
        <el-button @click="resetRoleFilters">重置</el-button>
        <span>{{ visibleRoles.length }} 个角色 · {{ totalPermissions }} 项可配置权限</span>
      </header>

      <el-table :data="visibleRoles" height="calc(100vh - 415px)" empty-text="当前筛选条件下没有角色">
        <el-table-column label="角色" min-width="185"><template #default="scope"><div class="role-cell"><el-icon :class="scope.row.is_system ? 'system' : 'custom'"><Lock v-if="scope.row.is_system" /><Key v-else /></el-icon><div><strong>{{ scope.row.name }}</strong><span>{{ scope.row.code }}</span></div></div></template></el-table-column>
        <el-table-column label="所属组织" min-width="155"><template #default="scope">{{ scope.row.organization_name || '平台通用' }}</template></el-table-column>
        <el-table-column label="账号数" width="90"><template #default="scope"><strong>{{ scope.row.member_count }}</strong> 人</template></el-table-column>
        <el-table-column label="数据范围" min-width="120"><template #default="scope"><el-tag effect="plain">{{ scope.row.data_scope_label }}</el-tag></template></el-table-column>
        <el-table-column label="功能权限" min-width="190"><template #default="scope"><div class="permission-preview"><strong>{{ scope.row.permissions.length }} 项</strong><span>{{ scope.row.permissions.slice(0, 2).map(permissionName).join('、') || '未配置' }}<template v-if="scope.row.permissions.length > 2"> 等</template></span></div></template></el-table-column>
        <el-table-column label="类型" width="100"><template #default="scope"><el-tag :type="roleTagType(scope.row)" effect="plain">{{ scope.row.is_system ? '系统内置' : '自定义' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="185" fixed="right"><template #default="scope"><el-button link type="primary" :icon="CopyDocument" @click="openRoleCopy(scope.row)">复制</el-button><el-button link type="primary" :icon="EditPen" :disabled="scope.row.is_system" @click="openRoleEdit(scope.row)">编辑</el-button><el-button link type="danger" :disabled="scope.row.is_system || scope.row.member_count > 0" @click="deleteRole(scope.row)">删除</el-button></template></el-table-column>
      </el-table>
      <footer class="system-footer"><span>系统角色不可修改；复制后可按组织定制</span><span><el-icon><Lock /></el-icon> 角色被账号使用时不可删除</span></footer>
    </section>

    <el-drawer v-model="memberDrawerVisible" size="500px" :with-header="false" destroy-on-close>
      <div class="system-drawer">
        <header><div><h2>{{ drawerTitle }}</h2><p>{{ editingMember ? '调整角色、数据范围或启用状态' : '将已注册用户开通为后台账号' }}</p></div><button aria-label="关闭" @click="memberDrawerVisible = false"><el-icon><Close /></el-icon></button></header>
        <section class="drawer-intro"><el-icon><UserFilled /></el-icon><div><strong>{{ editingMember ? editingMember.user_name : '添加后台成员' }}</strong><p>{{ editingMember ? editingMember.phone : '账号需先在用户端完成注册，不会在后台生成初始密码。' }}</p></div></section>
        <el-form class="drawer-form" label-position="top">
          <el-form-item v-if="!editingMember" label="已注册手机号" required><el-input v-model="memberForm.phone" maxlength="11" placeholder="请输入 11 位手机号" /></el-form-item>
          <el-form-item label="所属组织" required><el-select v-model="memberForm.organization" :disabled="Boolean(editingMember)" placeholder="请选择组织" @change="changeMemberOrganization"><el-option v-for="organization in organizations" :key="organization.id" :label="`${organization.name} · ${organization.organization_type_label}`" :value="organization.id" /></el-select></el-form-item>
          <el-form-item label="账号角色" required><el-select v-model="memberForm.role" placeholder="请选择角色"><el-option v-for="role in memberRoleOptions" :key="role.id" :label="`${role.name} · ${role.data_scope_label}`" :value="role.id" /></el-select><p class="field-help">角色决定可访问的功能和基础数据范围。</p></el-form-item>
          <el-form-item v-if="selectedMemberRole?.data_scope === 'city'" label="额外城市编码" required><el-select v-model="memberForm.city_codes" multiple filterable allow-create default-first-option placeholder="输入城市编码后回车"><el-option v-for="code in selectedRoleOrganization?.city_codes || []" :key="code" :label="code" :value="code" /></el-select><p class="field-help">例如 130400。当前阶段按城市编码授权，后续可接入城市字典。</p></el-form-item>
          <el-form-item label="账号状态"><div class="status-setting"><div><strong>{{ memberForm.is_active ? '启用后台访问' : '停止后台访问' }}</strong><span>{{ memberForm.is_active ? '保存后账号可按角色访问管理端' : '停用后账号将失去后台权限' }}</span></div><el-switch v-model="memberForm.is_active" /></div></el-form-item>
        </el-form>
        <footer><el-button @click="memberDrawerVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveMember">{{ editingMember ? '保存修改' : '确认添加' }}</el-button></footer>
      </div>
    </el-drawer>

    <el-drawer v-model="roleDrawerVisible" size="680px" :with-header="false" destroy-on-close>
      <div class="system-drawer role-drawer">
        <header><div><h2>{{ roleDrawerTitle }}</h2><p>{{ copySource ? `基于“${copySource.name}”创建可编辑的自定义角色` : '配置功能权限与数据可见范围' }}</p></div><button aria-label="关闭" @click="roleDrawerVisible = false"><el-icon><Close /></el-icon></button></header>
        <el-form class="drawer-form role-form" label-position="top">
          <section class="form-section"><h3>基本信息</h3><div class="form-grid"><el-form-item label="所属组织" required><el-select v-model="roleForm.organization" :disabled="Boolean(editingRole)" placeholder="请选择组织" @change="changeRoleOrganization"><el-option v-for="organization in organizations" :key="organization.id" :label="organization.name" :value="organization.id" /></el-select></el-form-item><el-form-item label="数据范围" required><el-select v-model="roleForm.data_scope"><el-option v-for="scope in dataScopes" :key="scope.value" :label="scope.label" :value="scope.value" :disabled="scope.value === 'all' && selectedRoleOrganization?.organization_type !== 'platform'" /></el-select></el-form-item><el-form-item label="角色名称" required><el-input v-model="roleForm.name" maxlength="50" placeholder="例如：活动运营" @blur="changeRoleName" /></el-form-item><el-form-item label="角色编码" required><el-input v-model="roleForm.code" maxlength="50" placeholder="例如：activity-operator" /><p class="field-help">仅支持小写字母、数字、连字符和下划线。</p></el-form-item></div></section>
          <section class="form-section permission-section"><header><div><h3>功能权限</h3><p>按最小必要原则授权，已选择 {{ roleForm.permissions.length }} / {{ totalPermissions }} 项</p></div></header><div class="permission-groups"><article v-for="group in permissionGroups" :key="group.key"><header><el-checkbox :model-value="groupIsChecked(group)" :indeterminate="groupIsIndeterminate(group)" @change="togglePermissionGroup(group, Boolean($event))">{{ group.label }}</el-checkbox><span>{{ groupCheckedCount(group) }}/{{ group.permissions.length }}</span></header><el-checkbox-group v-model="roleForm.permissions"><el-checkbox v-for="permission in group.permissions" :key="permission.code" :value="permission.code"><strong>{{ permission.label }}</strong><small>{{ permission.code }}</small></el-checkbox></el-checkbox-group></article></div></section>
        </el-form>
        <footer><span><el-icon><Lock /></el-icon> 保存后立即生效并记录审计日志</span><el-button @click="roleDrawerVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveRole">{{ editingRole ? '保存修改' : '创建角色' }}</el-button></footer>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.system-management-page{min-height:calc(100vh - 76px)}.system-heading{margin-bottom:16px}.heading-actions{display:flex;gap:8px}.system-tabs{display:flex;align-items:center;height:58px;margin-bottom:14px;padding:0 18px;border:1px solid var(--line);border-radius:8px;background:#fff}.system-tabs button{display:flex;align-items:center;gap:8px;height:58px;padding:0 22px;border:0;border-bottom:2px solid transparent;color:#5c6674;background:transparent}.system-tabs button.active{border-bottom-color:var(--brand);color:#078f94;font-weight:600}.system-tabs button b{display:grid;place-items:center;min-width:22px;height:20px;padding:0 6px;border-radius:10px;color:#67717e;background:#eef2f4;font-size:11px}.system-tabs button.active b{color:#078f94;background:#e5f8f8}.system-tabs .audit-link{height:auto;margin-left:auto;padding:8px;color:#078f94;font-size:13px}.system-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:hidden;margin-bottom:14px;border:1px solid var(--line);border-radius:8px;background:#fff}.system-metrics article{display:flex;align-items:center;gap:13px;min-height:86px;padding:15px 20px;border-right:1px solid #edf0f3}.system-metrics article:last-child{border-right:0}.system-metrics .el-icon{width:42px;height:42px;border-radius:11px;font-size:22px}.system-metrics .cyan{color:#00aeb4!important;background:#e4f8f8}.system-metrics .green{color:#078d76;background:#e6f7f1}.system-metrics .purple{color:#7657cc;background:#f0edff}.system-metrics .blue{color:#2679e9!important;background:#e9f1ff}.system-metrics div{display:grid;grid-template-columns:auto auto;align-items:baseline;column-gap:9px}.system-metrics span{grid-column:1;color:var(--muted);font-size:12px}.system-metrics strong{grid-column:1;font-size:25px}.system-metrics small{grid-column:2;grid-row:2;color:#98a0aa;font-size:11px}.system-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.member-filters{display:grid;grid-template-columns:minmax(210px,1.5fr) 170px 150px 120px 66px 66px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.role-filters{display:grid;grid-template-columns:minmax(240px,1fr) 190px 66px 1fr;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.role-filters>span{justify-self:end;color:var(--muted);font-size:12px}.member-cell,.role-cell{display:flex;align-items:center;gap:10px}.member-cell>div,.role-cell>div,.two-line-cell,.permission-preview{display:flex;flex-direction:column;gap:4px}.member-cell strong,.role-cell strong,.two-line-cell strong,.permission-preview strong{font-size:13px}.member-cell span,.role-cell span,.two-line-cell span,.permission-preview span{color:var(--muted);font-size:11px}.member-cell .el-tag{margin-left:4px}.role-cell>.el-icon{width:38px;height:38px;border-radius:10px;font-size:19px}.role-cell>.el-icon.system{color:#66717f;background:#eef1f3}.role-cell>.el-icon.custom{color:#7657cc;background:#f0edff}.state-copy{display:inline-flex;align-items:center;gap:6px;font-size:12px}.state-copy i{width:7px;height:7px;border-radius:50%}.state-copy.active{color:#078d76}.state-copy.active i{background:#13aa7a;box-shadow:0 0 0 4px #e6f7f1}.state-copy.inactive{color:#838b96}.state-copy.inactive i{background:#a7adb5}.system-footer{display:flex;align-items:center;justify-content:space-between;height:55px;padding:0 17px;color:var(--muted);font-size:12px}.system-footer span:last-child{display:flex;align-items:center;gap:5px}.system-drawer{min-height:100%;padding-bottom:80px;background:#f7f9fb}.system-drawer>header{position:sticky;z-index:4;top:0;display:flex;align-items:center;height:76px;padding:0 24px;border-bottom:1px solid var(--line);background:#fff}.system-drawer>header>div{margin-right:auto}.system-drawer>header h2{margin:0;font-size:20px}.system-drawer>header p{margin:5px 0 0;color:var(--muted);font-size:12px}.system-drawer>header button{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px}.system-drawer>header button:hover{background:#f0f4f5}.drawer-intro{display:flex;align-items:center;gap:13px;margin:16px 20px 0;padding:16px;border:1px solid #cce8e9;border-radius:8px;background:#f2fbfb}.drawer-intro>.el-icon{width:42px;height:42px;border-radius:11px;color:#078f94;background:#dff5f5;font-size:21px}.drawer-intro strong{font-size:14px}.drawer-intro p{margin:5px 0 0;color:#63707d;font-size:12px;line-height:1.55}.drawer-form{margin:14px 20px 0;padding:20px;border:1px solid var(--line);border-radius:8px;background:#fff}.drawer-form .el-select{width:100%}.field-help{width:100%;margin:6px 0 0;color:#8a929d;font-size:11px;line-height:1.5}.status-setting{display:flex;align-items:center;width:100%;padding:13px 14px;border:1px solid #e5e9ec;border-radius:7px}.status-setting>div{display:flex;flex:1;flex-direction:column;gap:5px}.status-setting strong{font-size:13px}.status-setting span{color:var(--muted);font-size:11px}.system-drawer>footer{position:fixed;right:0;bottom:0;z-index:5;display:flex;align-items:center;justify-content:flex-end;gap:9px;width:500px;height:72px;padding:0 20px;border-top:1px solid var(--line);background:#fff}.role-drawer{padding-bottom:86px}.role-drawer .drawer-form{margin:0;padding:0;border:0;border-radius:0;background:transparent}.role-drawer .form-section{margin:16px 20px 0;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff}.form-section>h3,.permission-section h3{margin:0 0 16px;font-size:15px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.permission-section>header{display:flex;align-items:center;margin-bottom:14px}.permission-section>header h3{margin:0}.permission-section>header p{margin:5px 0 0;color:var(--muted);font-size:11px}.permission-groups{display:flex;flex-direction:column;gap:10px}.permission-groups article{overflow:hidden;border:1px solid #e5e9ec;border-radius:7px}.permission-groups article>header{display:flex;align-items:center;justify-content:space-between;height:44px;padding:0 13px;background:#f6f8f9}.permission-groups article>header span{color:#8b939d;font-size:11px}.permission-groups .el-checkbox-group{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;padding:8px 13px}.permission-groups .el-checkbox{height:auto;min-height:45px;margin:0;padding:6px 0}.permission-groups .el-checkbox strong,.permission-groups .el-checkbox small{display:block}.permission-groups .el-checkbox strong{font-size:12px;font-weight:500}.permission-groups .el-checkbox small{margin-top:3px;color:#9aa1aa;font-size:10px}.role-drawer>footer{width:680px}.role-drawer>footer>span{display:flex;align-items:center;gap:5px;margin-right:auto;color:var(--muted);font-size:11px}:deep(.el-drawer__body){padding:0}:deep(.el-table th.el-table__cell){color:#606a77;background:#fafbfc}:deep(.el-table__row:hover td){background:#f2fbfb!important}:deep(.el-form-item__label){font-weight:600}:deep(.el-checkbox__label){line-height:1.35}@media(max-width:1360px){.member-filters{grid-template-columns:minmax(180px,1.2fr) 145px 135px 110px 62px 62px}.system-metrics article{padding:13px}.system-metrics small{display:none}}
</style>
