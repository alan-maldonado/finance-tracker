<script setup>
import AppLogo from './components/AppLogo.vue'
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <nav class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center">
      <RouterLink to="/" class="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
        <AppLogo class="w-9 h-7" />
        <span class="text-lg font-semibold text-white">Finance Tracker</span>
      </RouterLink>
      <div class="flex gap-4 ml-6">
        <RouterLink
          to="/"
          class="text-sm text-slate-400 hover:text-white transition-colors"
          active-class="!text-white font-medium"
        >
          Dashboard
        </RouterLink>
        <RouterLink
          to="/msi"
          class="text-sm text-slate-400 hover:text-white transition-colors"
          active-class="!text-white font-medium"
        >
          Installment Plans
        </RouterLink>
        <RouterLink
          to="/upcoming"
          class="text-sm text-slate-400 hover:text-white transition-colors"
          active-class="!text-white font-medium"
        >
          Upcoming Payments
        </RouterLink>
      </div>
      <RouterLink
        to="/settings"
        class="ml-auto text-slate-400 hover:text-white transition-colors"
        active-class="!text-white"
        title="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </RouterLink>
    </nav>
    <main class="max-w-7xl mx-auto px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
