<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProfileStore } from '../stores/profile.js'

const profileStore = useProfileStore()
const router = useRouter()
const open = ref(false)

function select(id) {
  profileStore.setActive(id)
  open.value = false
}

function goManage() {
  open.value = false
  router.push('/settings')
}
</script>

<template>
  <div class="relative">
    <button
      @click="open = !open"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm transition-colors"
    >
      <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: profileStore.activeProfile()?.color ?? '#6366f1' }"></span>
      <span class="max-w-32 truncate">{{ profileStore.activeProfile()?.name ?? 'Select profile' }}</span>
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
    </button>

    <div
      v-if="open"
      class="absolute left-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
      @click.stop
    >
      <div class="py-1">
        <button
          v-for="p in profileStore.profiles"
          :key="p.id"
          @click="select(p.id)"
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-slate-700 transition-colors"
          :class="p.id === profileStore.activeProfileId ? 'text-white font-medium' : 'text-slate-400'"
        >
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :style="{ backgroundColor: p.id === profileStore.activeProfileId ? (p.color ?? '#6366f1') : '#475569' }"
          ></span>
          {{ p.name }}
        </button>
      </div>
      <div class="border-t border-slate-700 py-1">
        <button
          @click="goManage"
          class="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Manage profiles
        </button>
      </div>
    </div>

    <!-- Click outside to close -->
    <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
  </div>
</template>
