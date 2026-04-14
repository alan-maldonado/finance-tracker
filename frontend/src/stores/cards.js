import { defineStore } from 'pinia'
import { ref } from 'vue'
import { cardsApi } from '../api/index.js'

export const useCardsStore = defineStore('cards', () => {
  const cards = ref([])
  const loading = ref(false)

  async function fetchCards(profile_id) {
    loading.value = true
    try {
      cards.value = await cardsApi.list(profile_id)
    } finally {
      loading.value = false
    }
  }

  async function createCard(data) {
    const card = await cardsApi.create(data)
    cards.value.push(card)
    return card
  }

  async function updateCard(id, data) {
    const updated = await cardsApi.update(id, data)
    const idx = cards.value.findIndex(c => c.id === id)
    if (idx !== -1) cards.value[idx] = updated
    return updated
  }

  async function deleteCard(id) {
    await cardsApi.remove(id)
    cards.value = cards.value.filter(c => c.id !== id)
  }

  async function reorderCards(ids) {
    // Optimistic: reorder locally first
    const map = new Map(cards.value.map(c => [c.id, c]))
    cards.value = ids.map(id => map.get(id)).filter(Boolean)
    await cardsApi.reorder(ids)
  }

  return { cards, loading, fetchCards, createCard, updateCard, deleteCard, reorderCards }
})
