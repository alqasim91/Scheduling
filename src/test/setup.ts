import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// The app starts in Split view from 1280px wide; tests run as on a desktop.
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 })

afterEach(() => {
  cleanup()
})
