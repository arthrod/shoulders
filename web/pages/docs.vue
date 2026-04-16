<template>
  <!-- Fill viewport below the fixed SiteHeader (h-14 = 56px) -->
  <div class="h-[calc(100vh-56px)] mt-14 w-full flex flex-col overflow-hidden">

    <!-- Mobile header -->
    <div class="md:hidden flex items-center justify-between px-4 py-2.5 border-b border-stone-100 bg-white z-20 flex-shrink-0">
      <button @click="mobileOpen = !mobileOpen" class="p-1 text-stone-400 hover:text-stone-600">
        <IconMenu2 :size="20" :stroke-width="1.5" />
      </button>
      <span class="font-serif font-medium text-base text-stone-900">{{ activeSection?.title || 'Docs' }}</span>
      <NuxtLink to="/" class="text-stone-400 hover:text-stone-600">
        <IconExternalLink :size="18" :stroke-width="1.5" />
      </NuxtLink>
    </div>

    <!-- Full-width scroll container (scrollbar at viewport edge) -->
    <div ref="scrollContainer" class="flex-1 overflow-y-auto scroll-smooth">
      <!-- Centered workspace -->
      <div class="flex w-full max-w-5xl min-h-full mx-auto relative">

        <!-- Sidebar column -->
        <div
          class="fixed inset-y-0 left-0 z-30 md:sticky md:top-0 md:inset-auto md:h-[calc(100vh-56px)] md:flex-shrink-0 bg-white md:bg-transparent shadow-lg md:shadow-none border-r border-stone-100 md:border-none"
          :class="[mobileOpen ? 'translate-x-0 w-56' : '-translate-x-full md:translate-x-0 w-56']"
        >
          <DocsSidebar
            :groups="sidebarGroups"
            :active-id="activeId"
            :is-mobile-open="mobileOpen"
            @select="selectSection"
            @toggle-mobile="mobileOpen = false"
          />
        </div>

        <!-- Mobile overlay backdrop -->
        <div
          v-if="mobileOpen"
          @click="mobileOpen = false"
          class="fixed inset-0 bg-black/10 z-20 md:hidden"
        />

        <!-- Content column -->
        <div class="flex-1 min-w-0 px-6 md:pl-12 md:pr-8 relative">
          <!-- Markdown actions -->
          <div class="absolute top-10 md:top-14 right-6 md:right-8 flex items-center z-10">
            <button
              @click="copyMarkdown"
              class="p-1.5 text-stone-300 hover:text-stone-500 transition-colors"
              :title="copied ? 'Copied!' : 'Copy as Markdown'"
            >
              <IconCheck v-if="copied" :size="15" :stroke-width="1.5" class="text-green-500" />
              <IconCopy v-else :size="15" :stroke-width="1.5" />
            </button>
            <div class="relative">
              <button
                @click.stop="mdMenuOpen = !mdMenuOpen"
                class="p-1 text-stone-300 hover:text-stone-500 transition-colors"
              >
                <IconChevronDown :size="13" :stroke-width="1.5" />
              </button>
              <div
                v-if="mdMenuOpen"
                class="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-sm py-1 min-w-[170px]"
              >
                <a
                  :href="`/docs/${activeId}.md`"
                  target="_blank"
                  class="flex items-center gap-2 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50 no-underline"
                  @click="mdMenuOpen = false"
                >
                  <IconFileText :size="14" :stroke-width="1.5" />
                  View as Markdown
                </a>
              </div>
            </div>
          </div>
          <article
            class="docs-prose py-10 md:py-14 pb-24 md:pb-32"
            v-html="activeHtml"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { IconMenu2, IconExternalLink, IconCopy, IconCheck, IconChevronDown, IconFileText } from '@tabler/icons-vue'

definePageMeta({ layout: 'docs' })

useSeoMeta({
  title: 'Documentation — Shoulders',
  description: 'Learn how to use Shoulders — the AI workspace for researchers. Writing, references, code, and AI in one place.',
})

const GROUP_ORDER = ['Start', 'Writing', 'AI Assistant', 'Automation', 'Workspace']

const { data: docs } = await useFetch('/api/docs-compiled')

const sidebarGroups = computed(() => {
  if (!docs.value) return []
  const groups = {}
  for (const doc of docs.value) {
    if (!groups[doc.group]) groups[doc.group] = { label: doc.group, items: [] }
    groups[doc.group].items.push({ id: doc.id, title: doc.title })
  }
  return GROUP_ORDER.map(name => groups[name]).filter(Boolean)
})

const allSections = computed(() => docs.value || [])
const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const scrollContainer = ref(null)

const activeId = ref(route.query.section || 'getting-started')
const activeSection = computed(() => allSections.value.find(s => s.id === activeId.value))
const activeHtml = computed(() => activeSection.value?.html || '')

const mdMenuOpen = ref(false)
const copied = ref(false)

const copyMarkdown = async () => {
  try {
    const res = await fetch(`/docs/${activeId.value}.md`)
    const text = await res.text()
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (e) { console.error('Copy failed:', e) }
}

const closeMdMenu = () => { mdMenuOpen.value = false }
onMounted(() => document.addEventListener('click', closeMdMenu))
onUnmounted(() => document.removeEventListener('click', closeMdMenu))

const selectSection = (id, headingTitle = null) => {
  activeId.value = id
  mobileOpen.value = false
  router.replace({ query: { section: id } })

  if (headingTitle) {
    // Wait for the new section content to render via v-html
    setTimeout(() => {
      if (!scrollContainer.value) return

      const headings = Array.from(scrollContainer.value.querySelectorAll('.docs-prose h1, .docs-prose h2, .docs-prose h3'))
      const target = headings.find(h => h.textContent.trim() === headingTitle)

      if (target) {
        // We need to account for the fixed header height when scrolling
        const containerTop = scrollContainer.value.getBoundingClientRect().top
        const targetTop = target.getBoundingClientRect().top

        // Calculate scroll position, adding some padding (32px) above the heading
        const scrollTop = scrollContainer.value.scrollTop + (targetTop - containerTop) - 32

        scrollContainer.value.scrollTo({ top: scrollTop, behavior: 'smooth' })
      } else {
        scrollContainer.value.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 50) // Small delay to ensure DOM is updated
  } else if (scrollContainer.value) {
    scrollContainer.value.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

onMounted(() => {
  if (route.query.section) {
    const found = allSections.value.find(s => s.id === route.query.section)
    if (found) activeId.value = found.id
  }
})

watch(() => route.query.section, (val) => {
  if (val) {
    const found = allSections.value.find(s => s.id === val)
    if (found) activeId.value = found.id
  }
})
</script>

<style>
/* Docs prose — typography for all documentation content */
.docs-prose h1 {
  @apply font-serif text-2xl md:text-3xl font-semibold tracking-tight text-stone-900 mb-2;
}
.docs-prose .docs-subtitle {
  @apply text-base text-stone-400 mb-10;
}
.docs-prose h2 {
  @apply font-serif text-xl font-semibold tracking-tight text-stone-900 mt-14 mb-4;
}
.docs-prose h2:first-of-type {
  @apply mt-10;
}
.docs-prose h3 {
  @apply text-base font-semibold text-stone-900 mt-8 mb-3;
}
.docs-prose p {
  @apply text-base text-stone-600 leading-relaxed mb-4;
}
.docs-prose ul {
  @apply text-base text-stone-600 leading-relaxed list-disc pl-5 mb-4 space-y-1.5;
}
.docs-prose ol {
  @apply text-base text-stone-600 leading-relaxed list-decimal pl-5 mb-4 space-y-1.5;
}
.docs-prose li {
  @apply pl-0.5;
}
.docs-prose strong {
  @apply font-medium text-stone-800;
}
.docs-prose code {
  @apply text-stone-700 bg-stone-100 px-1 py-0.5 rounded text-xs font-mono;
}
.docs-prose pre {
  @apply bg-stone-50 border border-stone-200 rounded-lg p-4 mb-4 overflow-x-auto text-xs font-mono text-stone-700 leading-relaxed;
}
.docs-prose pre code {
  @apply bg-transparent p-0 rounded-none;
}
.docs-prose a {
  @apply text-stone-700 underline decoration-stone-300 hover:decoration-stone-500 transition-colors;
}
.docs-prose hr {
  @apply my-10 border-stone-100;
}

/* Tables */
.docs-prose table {
  @apply w-full text-sm mb-6;
}
.docs-prose table th {
  @apply text-left text-xs font-semibold text-stone-400 uppercase tracking-wider pb-2 border-b border-stone-200;
}
.docs-prose table td {
  @apply py-2.5 text-stone-600 border-b border-stone-100;
}
.docs-prose table td:first-child {
  @apply text-stone-800 font-medium pr-6;
}

/* Keyboard shortcut badge */
.docs-prose kbd {
  @apply inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-medium text-stone-500 bg-stone-100 border border-stone-200 rounded shadow-[0_1px_0_0_rgba(0,0,0,0.04)] font-mono leading-none;
}

/* Callout blocks (:::tip, :::note, :::warning) */
.docs-prose .docs-callout {
  @apply text-sm leading-relaxed text-stone-500 border-l-2 border-stone-200 pl-4 my-6;
}
.docs-prose .docs-callout::before {
  @apply block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1;
}
.docs-prose .docs-callout-tip::before {
  content: "Tip";
}
.docs-prose .docs-callout-note::before {
  content: "Note";
}
.docs-prose .docs-callout-warning::before {
  content: "Warning";
  @apply text-amber-500;
}
.docs-prose .docs-callout p {
  @apply mb-0;
}
</style>
