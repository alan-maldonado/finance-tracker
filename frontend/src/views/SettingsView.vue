<script setup>
import { ref, onMounted, watch } from 'vue'
import { useCardsStore } from '../stores/cards.js'
import { useProfileStore } from '../stores/profile.js'
import AddCardModal from '../components/AddCardModal.vue'
import EditCardModal from '../components/EditCardModal.vue'

const store = useCardsStore()
const profileStore = useProfileStore()
const showAddCard = ref(false)
const editingCard = ref(null)
const deletingId = ref(null)

// Profile management
const showAddProfile = ref(false)
const newProfileName = ref('')
const addingProfile = ref(false)
const renamingId = ref(null)
const renameValue = ref('')
const deletingProfileId = ref(null)

async function addProfile() {
  if (!newProfileName.value.trim()) return
  addingProfile.value = true
  try {
    const p = await profileStore.createProfile(newProfileName.value.trim())
    profileStore.setActive(p.id)
    newProfileName.value = ''
    showAddProfile.value = false
  } finally {
    addingProfile.value = false
  }
}

function startRename(profile) {
  renamingId.value = profile.id
  renameValue.value = profile.name
}

async function saveRename(id) {
  if (!renameValue.value.trim()) { renamingId.value = null; return }
  await profileStore.renameProfile(id, renameValue.value.trim())
  renamingId.value = null
}

async function deleteProfile(profile) {
  if (profileStore.profiles.length <= 1) return
  if (!confirm(`Delete profile "${profile.name}"? All its cards, statements, and transactions will be permanently removed.`)) return
  deletingProfileId.value = profile.id
  try {
    await profileStore.deleteProfile(profile.id)
  } finally {
    deletingProfileId.value = null
  }
}

const BANK_LABEL = { bbva: 'BBVA', banamex: 'Banamex', santander: 'Santander', other: 'Other' }
const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n)

onMounted(() => store.fetchCards(profileStore.activeProfileId))
watch(() => profileStore.activeProfileId, (id) => store.fetchCards(id))

async function deleteCard(card) {
  if (!confirm(`Delete "${card.alias}"? This will permanently remove all its statements and transactions.`)) return
  deletingId.value = card.id
  try {
    await store.deleteCard(card.id)
  } finally {
    deletingId.value = null
  }
}

// Drag-and-drop reorder
const dragIndex = ref(null)
const overIndex = ref(null)

function onDragStart(idx) {
  dragIndex.value = idx
}

function onDragOver(idx) {
  if (dragIndex.value === null || dragIndex.value === idx) return
  overIndex.value = idx
}

function onDrop(idx) {
  if (dragIndex.value === null || dragIndex.value === idx) return
  const cards = [...store.cards]
  const [moved] = cards.splice(dragIndex.value, 1)
  cards.splice(idx, 0, moved)
  store.reorderCards(cards.map(c => c.id))
  dragIndex.value = null
  overIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  overIndex.value = null
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-white">Settings</h1>
      <p class="text-slate-400 text-sm mt-1">Manage your credit cards and app preferences</p>
    </div>

    <!-- Profiles section -->
    <div class="mb-8">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-slate-300 font-semibold text-sm uppercase tracking-wide">Profiles</h2>
        <button
          @click="showAddProfile = !showAddProfile"
          class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          + Add profile
        </button>
      </div>

      <div v-if="showAddProfile" class="mb-3 flex gap-2">
        <input
          v-model="newProfileName"
          placeholder="Profile name"
          @keydown.enter="addProfile"
          @keydown.esc="showAddProfile = false; newProfileName = ''"
          class="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          autofocus
        />
        <button
          @click="addProfile"
          :disabled="addingProfile"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
        >
          {{ addingProfile ? '...' : 'Save' }}
        </button>
        <button
          @click="showAddProfile = false; newProfileName = ''"
          class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>

      <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div class="divide-y divide-slate-700">
          <div
            v-for="p in profileStore.profiles"
            :key="p.id"
            class="flex items-center gap-3 px-5 py-3.5"
            :class="p.id === profileStore.activeProfileId ? 'bg-indigo-950/30' : ''"
          >
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="p.id === profileStore.activeProfileId ? 'bg-indigo-400' : 'bg-slate-600'"></span>

            <template v-if="renamingId === p.id">
              <input
                v-model="renameValue"
                @keydown.enter="saveRename(p.id)"
                @keydown.esc="renamingId = null"
                class="flex-1 bg-slate-700 border border-slate-600 text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
              />
              <button @click="saveRename(p.id)" class="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">Save</button>
              <button @click="renamingId = null" class="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">Cancel</button>
            </template>
            <template v-else>
              <span class="flex-1 text-white text-sm font-medium">{{ p.name }}</span>
              <button
                v-if="p.id !== profileStore.activeProfileId"
                @click="profileStore.setActive(p.id)"
                class="text-xs px-2 py-1 bg-slate-700 hover:bg-indigo-700 text-slate-300 hover:text-white rounded transition-colors"
              >
                Switch
              </button>
              <span v-else class="text-xs text-indigo-400 px-2">Active</span>
              <button
                @click="startRename(p)"
                class="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded transition-colors"
              >
                Rename
              </button>
              <button
                @click="deleteProfile(p)"
                :disabled="profileStore.profiles.length <= 1 || deletingProfileId === p.id"
                class="text-xs px-2 py-1 bg-slate-700 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {{ deletingProfileId === p.id ? '...' : 'Delete' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Upload -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-8 flex items-center justify-between">
      <div>
        <div class="text-white font-medium">Upload statement</div>
        <div class="text-slate-500 text-xs mt-0.5">Import a PDF statement for any of your cards</div>
      </div>
      <RouterLink
        to="/upload"
        class="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Upload PDF
      </RouterLink>
    </div>

    <!-- Cards section -->
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-slate-300 font-semibold text-sm uppercase tracking-wide">Credit cards</h2>
      <button
        @click="showAddCard = true"
        class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
      >
        + Add card
      </button>
    </div>

    <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div v-if="!store.cards.length" class="px-5 py-8 text-slate-500 text-sm italic text-center">
        No cards yet
      </div>
      <div v-else class="divide-y divide-slate-700">
        <div
          v-for="(card, idx) in store.cards"
          :key="card.id"
          draggable="true"
          @dragstart="onDragStart(idx)"
          @dragover.prevent="onDragOver(idx)"
          @drop.prevent="onDrop(idx)"
          @dragend="onDragEnd"
          class="flex items-center gap-4 px-5 py-4 transition-colors"
          :class="{
            'opacity-40': dragIndex === idx,
            'bg-indigo-950/40 border-t-2 border-indigo-500': overIndex === idx && dragIndex !== idx,
          }"
        >
          <!-- Drag handle -->
          <div class="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
            </svg>
          </div>

          <!-- Color dot + info -->
          <div class="w-4 h-4 rounded-full shrink-0" :style="{ backgroundColor: card.color }"></div>
          <div class="flex-1 min-w-0">
            <div class="text-white font-medium">{{ card.alias }}</div>
            <div class="text-slate-500 text-xs mt-0.5">
              {{ BANK_LABEL[card.bank] || card.bank }}
              <template v-if="card.last4"> · •••• {{ card.last4 }}</template>
              <template v-if="card.credit_limit"> · Limit {{ fmt(card.credit_limit) }}</template>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              @click="editingCard = card"
              class="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            >
              Edit
            </button>
            <button
              @click="deleteCard(card)"
              :disabled="deletingId === card.id"
              class="px-3 py-1.5 text-xs bg-slate-700 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition-colors disabled:opacity-40"
            >
              {{ deletingId === card.id ? '...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <p class="text-slate-600 text-xs mt-2 ml-1">
      Deleting a card permanently removes all its statements and transactions.
    </p>

    <!-- Modals -->
    <AddCardModal
      v-if="showAddCard"
      @close="showAddCard = false"
      @saved="showAddCard = false"
    />
    <EditCardModal
      v-if="editingCard"
      :card="editingCard"
      @close="editingCard = null"
      @saved="editingCard = null"
    />
  </div>
</template>
