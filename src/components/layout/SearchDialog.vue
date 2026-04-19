<template>
  <Teleport to="body">
    <Transition name="search-dialog">
      <div
        v-if="props.visible"
        class="fixed inset-0 z-[10000] flex justify-center"
        @mousedown.self="$emit('close')"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @mousedown.self="$emit('close')" />

        <!-- Dialog card -->
        <div
          class="relative w-[480px] max-w-[90vw] bg-surface-secondary rounded-xl shadow-2xl overflow-hidden"
          style="top: 20vh; height: fit-content; max-height: 70vh;"
        >
          <!-- Input row -->
          <div class="flex items-center h-12 px-4 border-b border-line/50">
            <svg class="shrink-0 text-content-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref="inputRef"
              v-model="query"
              class="flex-1 bg-transparent text-content text-sm ml-3 outline-none placeholder:text-content-muted"
              placeholder="Go to file..."
              spellcheck="false"
              @keydown.escape.prevent="$emit('close')"
              @keydown.down.prevent="searchResultsRef?.moveSelection(1)"
              @keydown.up.prevent="searchResultsRef?.moveSelection(-1)"
              @keydown.enter.prevent="searchResultsRef?.confirmSelection()"
            />
          </div>

          <!-- Results area -->
          <div class="overflow-y-auto" style="max-height: 60vh;">
            <SearchResults
              ref="searchResultsRef"
              :query="query"
              mode="embedded"
              @select-file="onSelectFile"
              @select-citation="onSelectCitation"
              @select-chat="onSelectChat"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import SearchResults from '../SearchResults.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'select-file', 'select-citation', 'select-chat'])

const query = ref('')
const inputRef = ref(null)
const searchResultsRef = ref(null)

// Auto-focus when dialog opens, clear query when closed
watch(() => props.visible, (val) => {
  if (val) {
    query.value = ''
    nextTick(() => inputRef.value?.focus())
  }
})

function onSelectFile(path) {
  emit('select-file', path)
  emit('close')
}

function onSelectCitation(key) {
  emit('select-citation', key)
  emit('close')
}

function onSelectChat(id) {
  emit('select-chat', id)
  emit('close')
}
</script>
