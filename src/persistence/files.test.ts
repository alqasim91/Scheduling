import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadText, readFileAsText } from './files.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('files', () => {
  it('downloadText clicks an anchor and revokes the object URL', () => {
    const create = vi.fn(() => 'blob:mock')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadText('a.json', '{}', 'application/json')

    expect(click).toHaveBeenCalledTimes(1)
    const anchor = click.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.download).toBe('a.json')
    expect(anchor.href).toBe('blob:mock')
    expect(revoke).toHaveBeenCalledWith('blob:mock')
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('readFileAsText reads file contents', async () => {
    await expect(readFileAsText(new File(['hello'], 'a.txt'))).resolves.toBe('hello')
  })
})
