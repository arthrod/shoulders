/**
 * Build a human-readable folder listing from a file tree.
 * Used for @folder mentions in chat and task inputs.
 *
 * @param {Array}  tree       - FileEntry[] from read_dir_recursive
 * @param {string} folderPath - Absolute path of the folder
 * @param {object} opts
 * @param {number} opts.maxDepth - Max directory depth to recurse (default 3)
 * @param {number} opts.maxFiles - Max files to list before truncating (default 100)
 * @returns {string} Formatted listing
 */
export function buildFolderListing(tree, folderPath, { maxDepth = 3, maxFiles = 100 } = {}) {
  const lines = []
  let fileCount = 0

  const walk = (entries, prefix, depth) => {
    if (depth > maxDepth || fileCount > maxFiles) return
    for (const entry of entries) {
      if (fileCount > maxFiles) break
      const name = entry.name + (entry.is_dir ? '/' : '')
      lines.push(prefix + name)
      if (!entry.is_dir) fileCount++
      if (entry.is_dir && entry.children && depth < maxDepth) {
        walk(entry.children, prefix + '  ', depth + 1)
      }
    }
  }

  walk(tree, '', 0)
  if (fileCount > maxFiles) lines.push('  ... (truncated)')

  return `Folder: ${folderPath}\nFiles: ${fileCount}\n\n${lines.join('\n')}`
}
