import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import CardDetailView from '../views/CardDetailView.vue'
import UploadView from '../views/UploadView.vue'
import UpcomingPaymentsView from '../views/MSIView.vue'
import MSIPlansView from '../views/MSIPlansView.vue'
import SettingsView from '../views/SettingsView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/cards/:id', component: CardDetailView, props: true },
    { path: '/upload', component: UploadView },
    { path: '/upcoming', component: UpcomingPaymentsView },
    { path: '/msi', component: MSIPlansView },
    { path: '/settings', component: SettingsView },
  ],
})
