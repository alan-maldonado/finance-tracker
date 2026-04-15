import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import CardDetailView from '../views/CardDetailView.vue'
import UploadView from '../views/UploadView.vue'
import UpcomingView from '../views/UpcomingView.vue'
import InstallmentsView from '../views/InstallmentsView.vue'
import SettingsView from '../views/SettingsView.vue'
import TrendsView from '../views/TrendsView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardView },
    { path: '/cards/:id', component: CardDetailView, props: true },
    { path: '/upload', component: UploadView },
    { path: '/upcoming', component: UpcomingView },
    { path: '/installments', component: InstallmentsView },
    { path: '/trends', component: TrendsView },
    { path: '/settings', component: SettingsView },
  ],
})
