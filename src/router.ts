import { createRouter, createWebHashHistory } from 'vue-router'

import { ADMIN_PAGES } from './navigation'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: { name: 'dashboard' } },
    ...ADMIN_PAGES.map((page) => ({
      path: `/${page.replaceAll('_', '-')}`,
      name: page,
      component: { render: () => null },
    })),
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})
