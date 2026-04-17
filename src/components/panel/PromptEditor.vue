<template>
  <div class="px-3 py-2 mx-3 my-1 rounded border" style="background: rgb(var(--bg-primary)); border-color: rgb(var(--border));">
    <input
      ref="titleRef"
      v-model="title"
      type="text"
      placeholder="Prompt title..."
      class="w-full ui-text-base border-none outline-none bg-transparent mb-1.5"
      style="color: rgb(var(--fg-primary));"
      @keydown.escape="$emit('cancel')"
    />
    <textarea
      ref="bodyRef"
      v-model="body"
      placeholder="What should the AI do?"
      rows="3"
      class="w-full ui-text-sm border-none outline-none bg-transparent resize-none"
      style="color: rgb(var(--fg-secondary));"
      @keydown.escape="$emit('cancel')"
      @keydown.meta.enter="save"
      @keydown.ctrl.enter="save"
    />
    <div class="flex items-center justify-end gap-2 mt-1.5">
      <button
        class="ui-text-sm bg-transparent border-none cursor-pointer"
        style="color: rgb(var(--fg-muted));"
        @click="$emit('cancel')"
      >Cancel</button>
      <button
        class="ui-text-sm bg-transparent border-none cursor-pointer"
        :style="{ color: canSave ? 'rgb(var(--accent))' : 'rgb(var(--fg-muted))', opacity: canSave ? 1 : 0.5 }"
        :disabled="!canSave"
        @click="save"
      >Save</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  initialTitle: { type: String, default: '' },
  initialBody: { type: String, default: '' },
})

const emit = defineEmits(['save', 'cancel'])

const titleRef = ref(null)
const bodyRef = ref(null)
const title = ref(props.initialTitle)
const body = ref(props.initialBody)

const canSave = computed(() => title.value.trim().length > 0 && body.value.trim().length > 0)

function save() {
  if (!canSave.value) return
  emit('save', { title: title.value, body: body.value })
}

onMounted(() => {
  titleRef.value?.focus()
})
</script>
