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
  // Selecting an amud only changes the query: keep the scroll position then, or the page jumps
  // to the top on every tap of a chart.
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition
    if (to.path === from.path) return false
    if (to.hash) return { el: to.hash }
    return { top: 0 }
  },
})
