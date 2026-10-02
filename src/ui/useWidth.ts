import { useEffect, useState } from 'react'

/** The window's inner width, kept current while it is resized. */
export function useWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

export const NARROW_PX = 900
export const SPLIT_PX = 1280
