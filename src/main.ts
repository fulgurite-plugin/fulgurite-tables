// Tables, like Obsidian's Advanced Tables: in a markdown table, Tab and Shift-Tab move between cells, Enter to the same
// cell of the next row (a new row at the end; Enter on an empty last row leaves the table), and every move lines the
// columns up. "Insert table" and "Format table" in the palette. Typing keys only: Vim's normal mode keeps its own.
import type { EditorView, Plugin } from "fulgurite"

type Align = "left" | "center" | "right" | null

export interface Table {
  /** UTF-16 offsets: the first line's start, the last line's end (before its newline). */
  start: number
  end: number
  /** Trimmed cells, row by row; row 1 is the rule under the header. */
  rows: string[][]
  aligns: Align[]
}

const RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/** Width in a monospaced grid: East Asian wide characters (Hangul, CJK, full-width forms, emoji) take two cells. */
export function width(text: string): number {
  let cells = 0
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    const wide = (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)
    cells += wide ? 2 : 1
  }
  return cells
}

/** A row's cells: split on unescaped `|`, the border pipes dropped, trimmed. */
function cells(line: string): string[] {
  const out: string[] = []
  let current = ""
  let escaped = false
  for (const ch of line) {
    if (ch === "|" && !escaped) {
      out.push(current)
      current = ""
    } else current += ch
    escaped = ch === "\\" && !escaped
  }
  out.push(current)
  const trimmed = line.trim()
  if (trimmed.startsWith("|")) out.shift()
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|") && out.length > 1) out.pop()
  return out.map((c) => c.trim())
}

/** The table around `offset`: consecutive lines starting with `|`, the second of them a rule. */
export function tableAt(text: string, offset: number): Table | null {
  const isRow = (from: number, to: number) => text.slice(from, to).trimStart().startsWith("|")
  let start = text.lastIndexOf("\n", offset - 1) + 1
  let end = text.indexOf("\n", offset)
  if (end < 0) end = text.length
  if (!isRow(start, end)) return null
  while (start > 0) {
    const previous = text.lastIndexOf("\n", start - 2) + 1
    if (!isRow(previous, start - 1)) break
    start = previous
  }
  while (end < text.length) {
    let next = text.indexOf("\n", end + 1)
    if (next < 0) next = text.length
    if (!isRow(end + 1, next)) break
    end = next
  }
  const lines = text.slice(start, end).split("\n")
  if (lines.length < 2 || !RULE.test(lines[1]!)) return null
  const rows = lines.map(cells)
  const aligns = rows[1]!.map((c): Align => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null))
  return { start, end, rows, aligns }
}

/** The table as aligned markdown, and where each cell's text begins (offsets from the table's start). */
export function render(table: Table): { text: string; cellStarts: number[][] } {
  const columns = Math.max(...table.rows.map((r) => r.length))
  const widths = Array.from({ length: columns }, (_, c) => Math.max(3, ...table.rows.map((r, i) => (i === 1 ? 0 : width(r[c] ?? "")))))
  const lines: string[] = []
  const cellStarts: number[][] = []
  let offset = 0
  table.rows.forEach((row, i) => {
    let line = "|"
    const starts: number[] = []
    for (let c = 0; c < columns; c++) {
      const align = table.aligns[c] ?? null
      let cell: string
      let lead = 0
      if (i === 1) {
        const colons = align === "center" ? 2 : align ? 1 : 0
        cell = (align === "left" || align === "center" ? ":" : "") + "-".repeat(widths[c]! - colons) + (align === "right" || align === "center" ? ":" : "")
      } else {
        const text = row[c] ?? ""
        const pad = widths[c]! - width(text)
        lead = align === "right" ? pad : align === "center" ? Math.floor(pad / 2) : 0
        cell = " ".repeat(lead) + text + " ".repeat(pad - lead)
      }
      starts.push(offset + line.length + 1 + lead)
      line += ` ${cell} |`
    }
    lines.push(line)
    cellStarts.push(starts)
    offset += line.length + 1
  })
  return { text: lines.join("\n"), cellStarts }
}

/** Which row and cell of `table` the offset is in. */
function position(text: string, table: Table, offset: number): [row: number, column: number] {
  const row = text.slice(table.start, offset).split("\n").length - 1
  const before = text.slice(text.lastIndexOf("\n", offset - 1) + 1, offset)
  const pipes = before.split(/(?<!\\)\|/).length - 1
  const leading = before.trimStart().startsWith("|") ? 1 : 0
  return [row, Math.max(0, pipes - leading)]
}

/** Puts the formatted table back and the cursor at the start of cell (row, column); a row past the end is added. */
function settle(view: EditorView, table: Table, row: number, column: number) {
  const columns = Math.max(...table.rows.map((r) => r.length))
  if (row >= table.rows.length) table.rows.push(Array(columns).fill(""))
  const { text, cellStarts } = render(table)
  view.replace(table.start, table.end, text)
  view.moveCursor(table.start + cellStarts[row]![Math.min(column, columns - 1)]!)
}

const plugin: Plugin = {
  onLoad(ctx) {
    ctx.editor.registerExtension({
      onKey(key, view) {
        if ((key !== "<Tab>" && key !== "<S-Tab>" && key !== "<CR>") || view.selection) return false
        const table = tableAt(view.text, view.cursor)
        if (!table) return false
        const [row, column] = position(view.text, table, view.cursor)
        const last = table.rows.length - 1
        const columns = Math.max(...table.rows.map((r) => r.length))
        if (key === "<CR>") {
          if (row === last && row > 1 && table.rows[row]!.every((c) => !c)) {
            // An empty last row: it becomes a plain line below the table.
            const rowStart = view.text.lastIndexOf("\n", view.cursor - 1) + 1
            view.replace(rowStart, table.end, "")
            return true
          }
          settle(view, table, row === 0 ? 2 : row + 1, column)
        } else if (key === "<Tab>") {
          if (column + 1 < columns) settle(view, table, row === 1 ? 2 : row, column + 1)
          else settle(view, table, row === 0 ? 2 : row + 1, 0)
        } else if (column > 0) {
          settle(view, table, row === 1 ? 0 : row, column - 1)
        } else {
          settle(view, table, row <= 2 ? 0 : row - 1, row === 0 ? 0 : columns - 1)
        }
        return true
      },
    })

    ctx.commands.add({
      id: "insert",
      name: "Insert table",
      editorCallback(view) {
        const lineStart = view.text.lastIndexOf("\n", view.cursor - 1) + 1
        const lineEnd = view.text.indexOf("\n", view.cursor) < 0 ? view.text.length : view.text.indexOf("\n", view.cursor)
        const onBlankLine = !view.text.slice(lineStart, lineEnd).trim()
        const at = onBlankLine ? lineStart : lineEnd
        const prefix = onBlankLine ? "" : "\n"
        const { text, cellStarts } = render({ start: 0, end: 0, rows: [["", ""], [], ["", ""]], aligns: [null, null] })
        view.replace(at, onBlankLine ? lineEnd : at, prefix + text)
        view.moveCursor(at + prefix.length + cellStarts[0]![0]!)
      },
    })
    ctx.commands.add({
      id: "format",
      name: "Format table",
      editorCallback(view) {
        const table = tableAt(view.text, view.cursor)
        if (!table) {
          ctx.notice("Put the cursor in a table first")
          return
        }
        const [row, column] = position(view.text, table, view.cursor)
        settle(view, table, row, column)
      },
    })
  },
}

export default plugin
