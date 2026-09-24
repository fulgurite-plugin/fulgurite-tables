# Tables

Markdown tables in [Fulgurite](https://github.com/Fulgurite-Plugin), like Obsidian's Advanced Tables. In a table (in
insert mode, with Vim):

- Tab / Shift-Tab: the next / previous cell
- Enter: the same cell in the next row, adding one at the end; Enter on an empty last row leaves the table
- Every move lines the columns up, keeping the alignment colons and counting wide East Asian characters as two

Commands: **Insert table** (2×2) and **Format table**. A table is consecutive lines starting with `|` whose second line
is the `|---|` rule.

## Development

See [api](https://github.com/Fulgurite-Plugin/fulgurite-api).
