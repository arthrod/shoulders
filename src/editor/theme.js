import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const shouldersTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'rgb(var(--bg-primary))',
      color: 'rgb(var(--fg-primary))',
    },
    '.cm-content': {
      caretColor: 'rgb(var(--accent))',
      fontFamily: "var(--font-mono)",
      padding: '16px 0',
      lineHeight: '1.6',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'rgb(var(--accent))',
      borderLeftWidth: '2px',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgb(var(--editor-active-line))',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgb(var(--editor-selection)) !important',
    },
    '.cm-gutters': {
      backgroundColor: 'rgb(var(--bg-primary))',
      color: 'rgb(var(--fg-muted))',
      border: 'none',
      paddingLeft: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'rgb(var(--fg-secondary))',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 4px',
      minWidth: '32px',
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgb(var(--editor-bracket-match))',
      outline: '1px solid rgb(var(--editor-bracket-border))',
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgb(var(--editor-search-match))',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgb(var(--editor-search-match))',
      outline: '1px solid rgb(var(--accent))',
    },
    '.cm-panels': {
      backgroundColor: 'rgb(var(--bg-secondary))',
      color: 'rgb(var(--fg-primary))',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid rgb(var(--border))',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid rgb(var(--border))',
    },
    '.cm-button': {
      backgroundColor: 'rgb(var(--bg-tertiary))',
      backgroundImage: 'none',
      color: 'rgb(var(--fg-primary))',
      border: '1px solid rgb(var(--border))',
      borderRadius: '4px',
      padding: '2px 8px',
      cursor: 'pointer',
    },
    '.cm-textfield': {
      backgroundColor: 'rgb(var(--bg-primary))',
      color: 'rgb(var(--fg-primary))',
      border: '1px solid rgb(var(--border))',
      borderRadius: '4px',
    },
    '.cm-tooltip': {
      backgroundColor: 'rgb(var(--bg-secondary))',
      border: '1px solid rgb(var(--border))',
      color: 'rgb(var(--fg-primary))',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li': {
        padding: '4px 8px',
      },
      '& > ul > li[aria-selected]': {
        backgroundColor: 'rgb(var(--bg-hover))',
        color: 'rgb(var(--fg-primary))',
      },
    },
  },
  { dark: true }
)

export const shouldersHighlightStyle = HighlightStyle.define([
  // ── Markdown / prose ──────────────────────────────────
  { tag: tags.heading1, color: 'rgb(var(--hl-heading))', fontWeight: 'bold', fontSize: '1.4em' },
  { tag: tags.heading2, color: 'rgb(var(--hl-heading))', fontWeight: 'bold', fontSize: '1.25em' },
  { tag: tags.heading3, color: 'rgb(var(--hl-heading))', fontWeight: 'bold', fontSize: '1.1em' },
  { tag: tags.heading4, color: 'rgb(var(--hl-heading-minor))', fontWeight: 'bold' },
  { tag: tags.heading5, color: 'rgb(var(--hl-heading-minor))', fontWeight: 'bold' },
  { tag: tags.heading6, color: 'rgb(var(--hl-heading-minor))', fontWeight: 'bold' },
  { tag: tags.emphasis, color: 'rgb(var(--hl-emphasis))', fontStyle: 'italic' },
  { tag: tags.strong, color: 'rgb(var(--fg-primary))', fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'rgb(var(--fg-muted))' },
  { tag: tags.link, color: 'rgb(var(--hl-link))', textDecoration: 'underline' },
  { tag: tags.url, color: 'rgb(var(--hl-link))' },
  { tag: tags.monospace, color: 'rgb(var(--hl-code))', fontFamily: "var(--font-mono)" },
  { tag: tags.quote, color: 'rgb(var(--fg-secondary))', fontStyle: 'italic' },
  { tag: tags.list, color: 'rgb(var(--hl-list))' },
  { tag: tags.contentSeparator, color: 'rgb(var(--fg-muted))' },

  // ── Comments ──────────────────────────────────────────
  { tag: tags.comment, color: 'rgb(var(--hl-comment))', fontStyle: 'italic' },
  { tag: tags.lineComment, color: 'rgb(var(--hl-comment))', fontStyle: 'italic' },
  { tag: tags.blockComment, color: 'rgb(var(--hl-comment))', fontStyle: 'italic' },
  { tag: tags.docComment, color: 'rgb(var(--hl-comment))', fontStyle: 'italic' },

  // ── Strings & literals ────────────────────────────────
  { tag: tags.string, color: 'rgb(var(--hl-string))' },
  { tag: tags.docString, color: 'rgb(var(--hl-string))', fontStyle: 'italic' },
  { tag: tags.character, color: 'rgb(var(--hl-string))' },
  { tag: tags.special(tags.string), color: 'rgb(var(--hl-string))' },
  { tag: tags.regexp, color: 'rgb(var(--hl-regexp))' },
  { tag: tags.escape, color: 'rgb(var(--hl-escape))', fontWeight: 'bold' },
  { tag: tags.number, color: 'rgb(var(--hl-number))' },
  { tag: tags.integer, color: 'rgb(var(--hl-number))' },
  { tag: tags.float, color: 'rgb(var(--hl-number))' },
  { tag: tags.bool, color: 'rgb(var(--hl-constant))' },
  { tag: tags.null, color: 'rgb(var(--hl-constant))' },
  { tag: tags.atom, color: 'rgb(var(--hl-constant))' },

  // ── Keywords (differentiated) ─────────────────────────
  { tag: tags.keyword, color: 'rgb(var(--hl-keyword))' },
  { tag: tags.controlKeyword, color: 'rgb(var(--hl-ctrl-keyword))' },
  { tag: tags.definitionKeyword, color: 'rgb(var(--hl-def-keyword))' },
  { tag: tags.moduleKeyword, color: 'rgb(var(--hl-module-keyword))' },
  { tag: tags.operatorKeyword, color: 'rgb(var(--hl-keyword))' },
  { tag: tags.modifier, color: 'rgb(var(--hl-keyword))' },
  { tag: tags.self, color: 'rgb(var(--hl-self))' },
  { tag: tags.unit, color: 'rgb(var(--hl-number))' },

  // ── Names ─────────────────────────────────────────────
  { tag: tags.variableName, color: 'rgb(var(--fg-primary))' },
  { tag: tags.definition(tags.variableName), color: 'rgb(var(--fg-primary))' },
  { tag: tags.function(tags.variableName), color: 'rgb(var(--hl-function))' },
  { tag: tags.function(tags.definition(tags.variableName)), color: 'rgb(var(--hl-function))' },
  { tag: tags.constant(tags.variableName), color: 'rgb(var(--hl-constant))' },
  { tag: tags.standard(tags.variableName), color: 'rgb(var(--hl-function))' },
  { tag: tags.local(tags.variableName), color: 'rgb(var(--fg-primary))' },
  { tag: tags.special(tags.variableName), color: 'rgb(var(--hl-constant))' },

  // ── Types & classes ───────────────────────────────────
  { tag: tags.typeName, color: 'rgb(var(--hl-type))' },
  { tag: tags.className, color: 'rgb(var(--hl-class))' },
  { tag: tags.definition(tags.className), color: 'rgb(var(--hl-class))' },
  { tag: tags.definition(tags.typeName), color: 'rgb(var(--hl-type))' },
  { tag: tags.standard(tags.typeName), color: 'rgb(var(--hl-type))' },
  { tag: tags.namespace, color: 'rgb(var(--hl-type))' },
  { tag: tags.macroName, color: 'rgb(var(--hl-decorator))' },

  // ── Properties & attributes ───────────────────────────
  { tag: tags.propertyName, color: 'rgb(var(--hl-property))' },
  { tag: tags.function(tags.propertyName), color: 'rgb(var(--hl-function))' },
  { tag: tags.definition(tags.propertyName), color: 'rgb(var(--hl-property))' },
  { tag: tags.special(tags.propertyName), color: 'rgb(var(--hl-property))' },
  { tag: tags.attributeName, color: 'rgb(var(--hl-attribute))' },
  { tag: tags.attributeValue, color: 'rgb(var(--hl-string))' },

  // ── HTML / XML tags ───────────────────────────────────
  { tag: tags.tagName, color: 'rgb(var(--hl-tag))' },
  { tag: tags.standard(tags.tagName), color: 'rgb(var(--hl-tag))' },
  { tag: tags.angleBracket, color: 'rgb(var(--hl-punctuation))' },

  // ── Operators ─────────────────────────────────────────
  { tag: tags.operator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.arithmeticOperator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.logicOperator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.bitwiseOperator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.compareOperator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.updateOperator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.definitionOperator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.typeOperator, color: 'rgb(var(--hl-operator))' },
  { tag: tags.derefOperator, color: 'rgb(var(--hl-punctuation))' },

  // ── Punctuation & brackets ────────────────────────────
  { tag: tags.punctuation, color: 'rgb(var(--hl-punctuation))' },
  { tag: tags.separator, color: 'rgb(var(--hl-punctuation))' },
  { tag: tags.bracket, color: 'rgb(var(--hl-bracket))' },
  { tag: tags.paren, color: 'rgb(var(--hl-bracket))' },
  { tag: tags.squareBracket, color: 'rgb(var(--hl-bracket))' },
  { tag: tags.brace, color: 'rgb(var(--hl-bracket))' },

  // ── Meta & decorators ─────────────────────────────────
  { tag: tags.meta, color: 'rgb(var(--hl-decorator))' },
  { tag: tags.annotation, color: 'rgb(var(--hl-decorator))' },
  { tag: tags.processingInstruction, color: 'rgb(var(--fg-muted))' },
  { tag: tags.labelName, color: 'rgb(var(--hl-heading-minor))' },

  // ── CSS-specific ──────────────────────────────────────
  { tag: tags.color, color: 'rgb(var(--hl-constant))' },

  // ── Diff ──────────────────────────────────────────────
  { tag: tags.inserted, color: 'rgb(var(--success))' },
  { tag: tags.deleted, color: 'rgb(var(--error))' },
  { tag: tags.changed, color: 'rgb(var(--warning))' },

  // ── Invalid ───────────────────────────────────────────
  { tag: tags.invalid, color: 'rgb(var(--error))', textDecoration: 'underline wavy' },
])

export const shouldersHighlighting = syntaxHighlighting(shouldersHighlightStyle)
