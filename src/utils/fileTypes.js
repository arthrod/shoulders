const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
const MULTIMODAL_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const CSV_EXTS = ['csv', 'tsv']
const PDF_EXTS = ['pdf']
const DOCX_EXTS = ['docx']

const RUNNABLE_MAP = {
  r: 'r', R: 'r',
  py: 'python', pyw: 'python',
  jl: 'julia',
  rmd: 'r', Rmd: 'r', qmd: 'r',
}

function getExt(path) {
  const name = path.split('/').pop() || ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.substring(dot + 1).toLowerCase() : ''
}

export function isNewTab(path) {
  return path?.startsWith('newtab:')
}

export function isChatTab(path) {
  return path && path.startsWith('chat:')
}

export function getChatSessionId(path) {
  return path?.startsWith('chat:') ? path.slice(5) : null
}

export function isWorkflowTab(path) {
  return path?.startsWith('workflow:')
}

export function getWorkflowId(path) {
  return path?.startsWith('workflow:') ? path.slice('workflow:'.length) : null
}

export function isHtmlPreviewTab(path) {
  return path?.startsWith('htmlpreview:')
}

export function getHtmlPreviewPath(path) {
  return path?.startsWith('htmlpreview:') ? path.slice('htmlpreview:'.length) : null
}

export function isHtml(path) {
  const ext = getExt(path)
  return ext === 'html' || ext === 'htm'
}

export function isReferencePath(path) {
  return path.startsWith('ref:@')
}

export function referenceKeyFromPath(path) {
  return path.startsWith('ref:@') ? path.slice(5) : ''
}

/**
 * Word Bridge check function — set by editor store at init to avoid circular imports.
 * @type {((path: string) => boolean) | null}
 */
let _wordBridgeChecker = null

export function setWordBridgeChecker(fn) {
  _wordBridgeChecker = fn
}

/** Check if a file is connected via Word Bridge */
export function isWordBridge(path) {
  return _wordBridgeChecker ? _wordBridgeChecker(path) : false
}

export function getViewerType(path) {
  if (isNewTab(path)) return 'newtab'
  if (isReferencePath(path)) return 'reference'
  if (isChatTab(path)) return 'chat'
  if (isWorkflowTab(path)) return 'workflow'
  if (isHtmlPreviewTab(path)) return 'html-preview'
  const ext = getExt(path)
  if (PDF_EXTS.includes(ext)) return 'pdf'
  if (CSV_EXTS.includes(ext)) return 'csv'
  // Word Bridge takes priority over SuperDoc for .docx when connected
  if (DOCX_EXTS.includes(ext) && isWordBridge(path)) return 'word-bridge'
  if (DOCX_EXTS.includes(ext)) return 'docx'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (ext === 'ipynb') return 'notebook'
  if (ext === 'canvas') return 'canvas'
  return 'text'
}

export function isMarkdown(path) {
  const ext = getExt(path)
  return ext === 'md' || ext === 'rmd' || ext === 'qmd'
}

export function isLatex(path) {
  const ext = getExt(path)
  return ext === 'tex' || ext === 'latex'
}

export function isImage(path) {
  const ext = getExt(path)
  return IMAGE_EXTS.includes(ext)
}

export function isMultimodalImage(path) {
  const ext = getExt(path)
  return MULTIMODAL_IMAGE_EXTS.includes(ext)
}

export function isPdf(path) {
  const ext = getExt(path)
  return ext === 'pdf'
}

export function relativePath(fromFile, toFile) {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'))
  const fromParts = fromDir.split('/')
  const toParts = toFile.split('/')
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  const ups = fromParts.length - common
  const remainder = toParts.slice(common)
  if (ups === 0) return remainder.join('/')
  return '../'.repeat(ups) + remainder.join('/')
}

export function isBinaryFile(path) {
  if (isNewTab(path)) return false
  if (isReferencePath(path)) return false
  if (isChatTab(path)) return false
  if (isWorkflowTab(path)) return false
  if (isHtmlPreviewTab(path)) return false
  const ext = getExt(path)
  return IMAGE_EXTS.includes(ext) || PDF_EXTS.includes(ext) || DOCX_EXTS.includes(ext)
}

const ICON_MAP = {
  '_instructions.md': 'IconSparkles',
  md: 'IconFileText',
  txt: 'IconFileText',
  json: 'IconBraces',
  js: 'IconBrandJavascript',
  mjs: 'IconBrandJavascript',
  cjs: 'IconBrandJavascript',
  ts: 'IconBrandTypescript',
  tsx: 'IconBrandTypescript',
  jsx: 'IconBrandJavascript',
  py: 'IconBrandPython',
  rs: 'IconFileCode',
  go: 'IconFileCode',
  java: 'IconFileCode',
  c: 'IconFileCode',
  cpp: 'IconFileCode',
  h: 'IconFileCode',
  rb: 'IconFileCode',
  php: 'IconFileCode',
  swift: 'IconFileCode',
  kt: 'IconFileCode',
  html: 'IconBrandHtml5',
  css: 'IconBrandCss3',
  scss: 'IconBrandCss3',
  vue: 'IconBrandVue',
  svelte: 'IconFileCode',
  sh: 'IconTerminal2',
  bash: 'IconTerminal2',
  zsh: 'IconTerminal2',
  sql: 'IconDatabase',
  yaml: 'IconFileCode',
  yml: 'IconFileCode',
  toml: 'IconFileCode',
  xml: 'IconFileCode',
  svg: 'IconPhoto',
  png: 'IconPhoto',
  jpg: 'IconPhoto',
  jpeg: 'IconPhoto',
  gif: 'IconPhoto',
  webp: 'IconPhoto',
  bmp: 'IconPhoto',
  ico: 'IconPhoto',
  pdf: 'IconFileTypePdf',
  docx: 'IconFileTypeDocx',
  doc: 'IconFileTypeDoc',
  csv: 'IconTable',
  tsv: 'IconTable',
  env: 'IconLock',
  gitignore: 'IconLock',
  lock: 'IconLock',
  r: 'IconFileCode',
  rmd: 'IconFileText',
  qmd: 'IconFileText',
  jl: 'IconFileCode',
  ipynb: 'IconNotebook',
  canvas: 'IconVectorSpline',
  tex: 'IconMath',
  bib: 'IconFileText',
  lua: 'IconFileCode',
  zig: 'IconFileCode',
}

export function getFileIconName(fileName) {
  if (isReferencePath(fileName)) return 'IconBook2'
  const name = fileName.toLowerCase()
  // Check full filename first (e.g. ".gitignore", ".env")
  if (ICON_MAP[name]) return ICON_MAP[name]
  // Strip leading dot for dotfiles
  const stripped = name.startsWith('.') ? name.substring(1) : name
  if (ICON_MAP[stripped]) return ICON_MAP[stripped]
  // Extension
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const ext = name.substring(dot + 1)
    if (ICON_MAP[ext]) return ICON_MAP[ext]
  }
  return 'IconFile'
}

export function isRunnable(path) {
  if (isReferencePath(path)) return false
  const ext = getExt(path)
  return ext in RUNNABLE_MAP
}

export function getLanguage(path) {
  const ext = getExt(path)
  return RUNNABLE_MAP[ext] || null
}

export function isRmdOrQmd(path) {
  const ext = getExt(path)
  return ext === 'rmd' || ext === 'qmd'
}

export function getMimeType(path) {
  const ext = getExt(path)
  const mimes = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return mimes[ext] || 'application/octet-stream'
}
