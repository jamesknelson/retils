import { Source, getSnapshot, hasSnapshot, subscribe } from '../../src'

export function sendToArray<T>(source: Source<T>): T[]
export function sendToArray<T, U>(source: Source<T>, sealWith: U): (T | U)[]
export function sendToArray<T, U>(source: Source<T>, sealWith?: U): (T | U)[] {
  const array = [] as (T | U)[]
  if (hasSnapshot(source)) {
    array.unshift(getSnapshot(source))
  }
  subscribe(
    source,
    () => array.unshift(getSnapshot(source)),
    () => {
      if (sealWith) {
        array.push(sealWith)
      }
    },
  )
  return array
}
