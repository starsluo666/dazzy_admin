<script setup lang="ts">
const stats = [
  { label: '今日新增用户', value: '128', trend: '+12.6%' },
  { label: '待审核达人', value: '24', trend: '需处理' },
  { label: '进行中订单', value: '316', trend: '+8.2%' },
  { label: '待处理退款', value: '9', trend: '高优先级' },
]
</script>

<template>
  <el-container class="shell">
    <el-aside width="232px" class="aside">
      <div class="brand"><span class="brand-mark">D</span><span>DAZZY 运营台</span></div>
      <el-menu default-active="1" class="menu">
        <el-menu-item index="1">工作台</el-menu-item><el-menu-item index="2">用户管理</el-menu-item>
        <el-menu-item index="3">达人审核</el-menu-item><el-menu-item index="4">活动审核</el-menu-item>
        <el-menu-item index="5">订单管理</el-menu-item><el-menu-item index="6">退款与结算</el-menu-item>
        <el-menu-item index="7">内容与举报</el-menu-item><el-menu-item index="8">运营配置</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header"><div><h1>工作台</h1><p>2026年8月15日 · 平台运营概览</p></div><el-button>运营管理员</el-button></el-header>
      <el-main class="main">
        <section class="stats"><article v-for="item in stats" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.value }}</strong><em>{{ item.trend }}</em></article></section>
        <section class="panel"><header><div><h2>待办事项</h2><p>优先处理影响用户交易和平台安全的事项</p></div><el-button type="primary">查看全部</el-button></header>
          <el-table :data="[{type:'达人实名认证',count:24,priority:'高'}, {type:'活动发布审核',count:18,priority:'中'}, {type:'退款人工复核',count:9,priority:'高'}]">
            <el-table-column prop="type" label="事项"/><el-table-column prop="count" label="待处理数量"/><el-table-column prop="priority" label="优先级"/><el-table-column label="操作"><template #default><el-button link type="primary">立即处理</el-button></template></el-table-column>
          </el-table>
        </section>
      </el-main>
    </el-container>
  </el-container>
</template>
