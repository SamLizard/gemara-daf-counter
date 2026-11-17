import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/pages/HomePage.vue') },
    { path: '/masechtot', name: 'masechtot', component: () => import('@/pages/MasechtotPage.vue') },
    { path: '/masechet/:id', name: 'masechet', component: () => import('@/pages/MasechetPage.vue'), props: true },
    { path: '/about', name: 'about', component: () => import('@/pages/AboutPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
