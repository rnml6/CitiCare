import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const srcRoot = join(process.cwd(), 'src')

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return walk(path)
  if (!['.js', '.jsx'].includes(extname(entry.name))) return []
  if (entry.name.includes('.test.') || entry.name === 'setup.js') return []
  return [path]
})

// Matches bare alert/confirm/prompt calls and window.alert(...) but not
// dialog.confirm(...) or identifiers such as confirmAction.
const nativeDialogPattern = /(^|[^.\w])(window\.)?(alert|confirm|prompt)\s*\(/gm

describe('native dialog migration', () => {
  it('contains no application-owned alert, confirm, or prompt calls', () => {
    const offenders = []
    for (const file of walk(srcRoot)) {
      const source = readFileSync(file, 'utf8')
      if (nativeDialogPattern.test(source)) {
        nativeDialogPattern.lastIndex = 0
        offenders.push(file.replace(srcRoot, 'src/'))
      }
      nativeDialogPattern.lastIndex = 0
    }
    expect(offenders).toEqual([])
  })
})
