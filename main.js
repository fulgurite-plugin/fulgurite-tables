"use strict";
var __plugin = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/main.ts
  var main_exports = {};
  __export(main_exports, {
    default: () => main_default,
    render: () => render,
    tableAt: () => tableAt,
    width: () => width
  });
  var RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  function width(text) {
    let cells2 = 0;
    for (const ch of text) {
      const c = ch.codePointAt(0);
      const wide = c >= 4352 && c <= 4447 || c >= 11904 && c <= 42191 || c >= 44032 && c <= 55203 || c >= 63744 && c <= 64255 || c >= 65072 && c <= 65103 || c >= 65280 && c <= 65376 || c >= 65504 && c <= 65510 || c >= 127744 && c <= 129791 || c >= 131072 && c <= 262141;
      cells2 += wide ? 2 : 1;
    }
    return cells2;
  }
  function cells(line) {
    const out = [];
    let current = "";
    let escaped = false;
    for (const ch of line) {
      if (ch === "|" && !escaped) {
        out.push(current);
        current = "";
      } else current += ch;
      escaped = ch === "\\" && !escaped;
    }
    out.push(current);
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) out.shift();
    if (trimmed.endsWith("|") && !trimmed.endsWith("\\|") && out.length > 1) out.pop();
    return out.map((c) => c.trim());
  }
  function tableAt(text, offset) {
    const isRow = (from, to) => text.slice(from, to).trimStart().startsWith("|");
    let start = text.lastIndexOf("\n", offset - 1) + 1;
    let end = text.indexOf("\n", offset);
    if (end < 0) end = text.length;
    if (!isRow(start, end)) return null;
    while (start > 0) {
      const previous = text.lastIndexOf("\n", start - 2) + 1;
      if (!isRow(previous, start - 1)) break;
      start = previous;
    }
    while (end < text.length) {
      let next = text.indexOf("\n", end + 1);
      if (next < 0) next = text.length;
      if (!isRow(end + 1, next)) break;
      end = next;
    }
    const lines = text.slice(start, end).split("\n");
    if (lines.length < 2 || !RULE.test(lines[1])) return null;
    const rows = lines.map(cells);
    const aligns = rows[1].map((c) => c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null);
    return { start, end, rows, aligns };
  }
  function render(table) {
    const columns = Math.max(...table.rows.map((r) => r.length));
    const widths = Array.from({ length: columns }, (_, c) => Math.max(3, ...table.rows.map((r, i) => i === 1 ? 0 : width(r[c] ?? ""))));
    const lines = [];
    const cellStarts = [];
    let offset = 0;
    table.rows.forEach((row, i) => {
      let line = "|";
      const starts = [];
      for (let c = 0; c < columns; c++) {
        const align = table.aligns[c] ?? null;
        let cell;
        let lead = 0;
        if (i === 1) {
          const colons = align === "center" ? 2 : align ? 1 : 0;
          cell = (align === "left" || align === "center" ? ":" : "") + "-".repeat(widths[c] - colons) + (align === "right" || align === "center" ? ":" : "");
        } else {
          const text = row[c] ?? "";
          const pad = widths[c] - width(text);
          lead = align === "right" ? pad : align === "center" ? Math.floor(pad / 2) : 0;
          cell = " ".repeat(lead) + text + " ".repeat(pad - lead);
        }
        starts.push(offset + line.length + 1 + lead);
        line += ` ${cell} |`;
      }
      lines.push(line);
      cellStarts.push(starts);
      offset += line.length + 1;
    });
    return { text: lines.join("\n"), cellStarts };
  }
  function position(text, table, offset) {
    const row = text.slice(table.start, offset).split("\n").length - 1;
    const before = text.slice(text.lastIndexOf("\n", offset - 1) + 1, offset);
    const pipes = before.split(/(?<!\\)\|/).length - 1;
    const leading = before.trimStart().startsWith("|") ? 1 : 0;
    return [row, Math.max(0, pipes - leading)];
  }
  function settle(view, table, row, column) {
    const columns = Math.max(...table.rows.map((r) => r.length));
    if (row >= table.rows.length) table.rows.push(Array(columns).fill(""));
    const { text, cellStarts } = render(table);
    view.replace(table.start, table.end, text);
    view.moveCursor(table.start + cellStarts[row][Math.min(column, columns - 1)]);
  }
  var plugin = {
    onLoad(ctx) {
      ctx.editor.registerExtension({
        onKey(key, view) {
          if (key !== "<Tab>" && key !== "<S-Tab>" && key !== "<CR>" || view.selection) return false;
          const table = tableAt(view.text, view.cursor);
          if (!table) return false;
          const [row, column] = position(view.text, table, view.cursor);
          const last = table.rows.length - 1;
          const columns = Math.max(...table.rows.map((r) => r.length));
          if (key === "<CR>") {
            if (row === last && row > 1 && table.rows[row].every((c) => !c)) {
              const rowStart = view.text.lastIndexOf("\n", view.cursor - 1) + 1;
              view.replace(rowStart, table.end, "");
              return true;
            }
            settle(view, table, row === 0 ? 2 : row + 1, column);
          } else if (key === "<Tab>") {
            if (column + 1 < columns) settle(view, table, row === 1 ? 2 : row, column + 1);
            else settle(view, table, row === 0 ? 2 : row + 1, 0);
          } else if (column > 0) {
            settle(view, table, row === 1 ? 0 : row, column - 1);
          } else {
            settle(view, table, row <= 2 ? 0 : row - 1, row === 0 ? 0 : columns - 1);
          }
          return true;
        }
      });
      ctx.commands.add({
        id: "insert",
        name: "Insert table",
        editorCallback(view) {
          const lineStart = view.text.lastIndexOf("\n", view.cursor - 1) + 1;
          const lineEnd = view.text.indexOf("\n", view.cursor) < 0 ? view.text.length : view.text.indexOf("\n", view.cursor);
          const onBlankLine = !view.text.slice(lineStart, lineEnd).trim();
          const at = onBlankLine ? lineStart : lineEnd;
          const prefix = onBlankLine ? "" : "\n";
          const { text, cellStarts } = render({ start: 0, end: 0, rows: [["", ""], [], ["", ""]], aligns: [null, null] });
          view.replace(at, onBlankLine ? lineEnd : at, prefix + text);
          view.moveCursor(at + prefix.length + cellStarts[0][0]);
        }
      });
      ctx.commands.add({
        id: "format",
        name: "Format table",
        editorCallback(view) {
          const table = tableAt(view.text, view.cursor);
          if (!table) {
            ctx.notice("Put the cursor in a table first");
            return;
          }
          const [row, column] = position(view.text, table, view.cursor);
          settle(view, table, row, column);
        }
      });
    }
  };
  var main_default = plugin;
  return __toCommonJS(main_exports);
})();
