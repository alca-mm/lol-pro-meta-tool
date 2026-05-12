/** Parses a single CSV line respecting quoted fields. */
function parseLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i <= line.length) {
    if (i === line.length) {
      // trailing comma produced empty field, already pushed above
      break
    }
    if (line[i] === '"') {
      let field = ""
      i++ // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"'
          i += 2
        } else if (line[i] === '"') {
          i++ // skip closing quote
          break
        } else {
          field += line[i++]
        }
      }
      fields.push(field)
      if (line[i] === ",") i++
    } else {
      const end = line.indexOf(",", i)
      if (end === -1) {
        fields.push(line.slice(i))
        break
      } else {
        fields.push(line.slice(i, end))
        i = end + 1
      }
    }
  }
  return fields
}

/** Returns all rows as string arrays (including header). */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === "") continue
    rows.push(parseLine(line))
  }
  return rows
}

/** Returns rows as header-keyed objects. First row is used as header. */
export function parseCsvWithHeaders(content: string): Record<string, string>[] {
  const rows = parseCsv(content)
  if (rows.length < 1) return []
  const header = rows[0]
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = row[i] ?? ""
    }
    return obj
  })
}
