<script setup>
import { ref } from 'vue'
import { useProfileStore } from '../stores/profile.js'

const profileStore = useProfileStore()
const open = ref(false)

function select(id) {
  profileStore.setActive(id)
  open.value = false
}
</script>

<template>
  <div class="relative">
    <button
      @click="open = !open"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm transition-colors"
    >
      <span class="w-2 h-2 rounded-full bg-indigo-400 shrink-0"></span>
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
            :class="p.id === profileStore.activeProfileId ? 'bg-indigo-400' : 'bg-slate-600'"
          ></span>
          {{ p.name }}
        </button>
      </div>
    </div>

    <!-- Click outside to close -->
    <div v-if="open" class="fixed inset-0 z-40" @click="open = false"></div>
  </div>
</template>
