import { Deferred, isPromiseLike, noop } from 'retil-support'

import { Source, identitySelector } from './source'

export const TEARDOWN_DELAY = 10

export interface ObserveSubscribeFunction<T> {
  (
    next: (value: T) => void,
    error: (error: any) => void,
    complete: () => void, // noop
    clear: () => void,
  ): (() => void) | { unsubscribe(): void }
}

type SnapshotState<T> =
  | { value: T; deferred?: undefined }
  | { value?: undefined; deferred: Deferred<T> }

interface Subscription {
  count: number
  isSubscribing: boolean
  teardownTimeout?: any
  unsubscribe?: () => void
}

export function observe<T>(
  observable:
    | ObserveSubscribeFunction<T>
    | { subscribe: ObserveSubscribeFunction<T> },
): Source<T> {
  const asyncActs = new Set<PromiseLike<void>>()
  const callbacks = [] as (readonly [(() => void)?, (() => void)?])[]

  let actDeferred: Deferred<void> | null = null
  let actDepth = 0
  let error: null | { value: any } = null
  let nextSnapshot: null | { value: T } = null
  let sealed = false
  let snapshot: null | SnapshotState<T> = null
  let subscription: null | Subscription = null

  const observableSubscribe =
    typeof observable === 'function' ? observable : observable.subscribe

  const get = (): T => {
    subscribeIfRequired()
    if (error) {
      throw error.value
    }
    if (!snapshot) {
      snapshot = { deferred: new Deferred() }
    }
    // This must be called *after* the snapshot is created, as it checks if
    // the snapshot is a deferred.
    scheduleTeardownIfRequired()
    if (!snapshot.deferred) {
      return snapshot.value
    }
    // TODO: throw an object with a `then` that calls `subscribe`
    throw snapshot.deferred!.promise
  }

  const subscribe = (change?: () => void, seal?: () => void): (() => void) => {
    if (sealed) {
      if (seal) {
        seal()
      }
      return noop
    }
    if (error) {
      return noop
    }
    const pair = [change, seal] as const
    callbacks.push(pair)
    subscribeIfRequired()
    return () => {
      const index = callbacks.indexOf(pair)
      if (index !== -1) {
        callbacks.splice(index, 1)
        scheduleTeardownIfRequired()
      }
    }
  }

  const handleSnapshot = (value: T) => {
    const hasValue = (snapshot && !snapshot.deferred) || nextSnapshot
    const latestValue = nextSnapshot ? nextSnapshot.value : snapshot?.value

    if (sealed || !subscription || (hasValue && latestValue === value)) {
      return
    }

    nextSnapshot = { value }

    if (!actDepth) {
      commit()
    }
  }

  const handleClear = () => {
    nextSnapshot = null

    if (sealed || !subscription || !snapshot || snapshot.deferred) {
      return
    }

    snapshot = null

    notifySubscribers()
  }

  const handleSeal = () => {
    if (!subscription) {
      return
    }

    if (nextSnapshot) {
      commit()
    }

    if (snapshot === null || snapshot?.deferred) {
      handleError(new Error('Attempted to seal an observe() with no value'))
    }

    sealed = true

    // Tear down the subscription *without* removing the value
    const unsubscribe = subscription.unsubscribe!
    subscription = null
    try {
      unsubscribe()
    } catch {}

    callbacks.slice().forEach(([, seal]) => {
      if (seal) {
        seal()
      }
    })
    callbacks.length = 0
  }

  const handleError = (err: any) => {
    if (sealed || !subscription) {
      return
    }

    error = { value: err }
    const deferred = snapshot?.deferred
    notifySubscribers()
    teardownSubscription()
    callbacks.length = 0
    if (actDeferred) {
      actDeferred.reject(err)
    }
    if (deferred) {
      deferred.reject(err)
    }
  }

  const notifySubscribers = () => {
    // Some observables will immediately synchronously call `next` during
    // subscribe to let us know the current value. In this case, we'll
    // skip notifying subscribers, as they can get the value if they need
    // it.
    if (subscription && !subscription.isSubscribing) {
      callbacks.slice().forEach(callChangeListener)
    }
  }

  const subscribeIfRequired = () => {
    if (sealed) {
      return
    }
    if (subscription) {
      subscription.count++
      if (subscription.teardownTimeout) {
        clearTimeout(subscription.teardownTimeout)
      }
    } else if (!error) {
      subscription = {
        count: 1,
        isSubscribing: true,
      }
      const unsubscribeFunctionOrObject = observableSubscribe(
        handleSnapshot,
        handleError,
        handleSeal,
        handleClear,
      )
      const unsubscribe =
        typeof unsubscribeFunctionOrObject === 'function'
          ? unsubscribeFunctionOrObject
          : unsubscribeFunctionOrObject.unsubscribe
      if (subscription) {
        subscription.isSubscribing = false
        subscription.unsubscribe = unsubscribe
      } else {
        unsubscribe()
      }
    }
  }

  const scheduleTeardownIfRequired = () => {
    // Don't teardown if we've thrown a promises that hasn't yet resolved.
    if (subscription && --subscription.count === 0 && !snapshot?.deferred) {
      scheduleTeardown(subscription)
    }
  }

  const scheduleTeardown = (subscription: Subscription) => {
    // TODO: use requestIdleCallback instead if possible.
    subscription.teardownTimeout = setTimeout(
      teardownSubscription,
      TEARDOWN_DELAY,
    )
  }

  const teardownSubscription = () => {
    // Avoid teardown if we've since resubscribed
    if (subscription && subscription.count === 0) {
      const unsubscribe = subscription.unsubscribe!
      nextSnapshot = null
      snapshot = null
      subscription = null
      try {
        unsubscribe()
      } catch {}
    }
  }

  const commit = () => {
    if (sealed || !subscription || !nextSnapshot) return

    const actDeferredCopy = actDeferred
    const snapshotDeferred = snapshot?.deferred
    const value = nextSnapshot.value
    snapshot = nextSnapshot
    nextSnapshot = null
    actDeferred = null

    // Some observables will immediately synchronously call `next` during
    // subscribe to let us know the current value. In this case, we'll
    // skip notifying subscribers, as they can get the value if they need
    // it.
    notifySubscribers()

    if (snapshotDeferred) {
      snapshotDeferred.resolve(value)
    }
    if (actDeferredCopy) {
      actDeferredCopy.resolve()
    }

    // If we skipped a teardown due to an unresolved promise, we can now finish
    // it off.
    if (subscription && subscription.count === 0) {
      scheduleTeardown(subscription)
    }
  }

  // TODO: queue until the first subscriber is added - include listeners to the
  // promise returned by this function as listeners. All callbacks become async
  // if there's no listeners, and require any value to be cleared.
  const act = <U>(callback: () => PromiseLike<U> | U): Promise<U> => {
    if (error) {
      throw error.value
    }
    if (sealed) {
      return Promise.resolve(callback())
    }

    const isTopLevelAct = ++actDepth === 1
    const batch = (actDeferred = actDeferred || new Deferred())

    subscribeIfRequired()

    const result = callback()

    if (isPromiseLike(result)) {
      const asyncAct = result.then(() => {
        --actDepth
        scheduleTeardownIfRequired()
        asyncActs.delete(asyncAct)
        if (asyncActs.size === 0) {
          commit()
        }
      }, handleError)

      asyncActs.add(asyncAct)

      // Temporarily clear the result while waiting for the async action.
      if (snapshot && !snapshot?.deferred) {
        // Save the current snapshot in case nothing happens
        nextSnapshot = nextSnapshot || snapshot
        snapshot = null
        notifySubscribers()
      }
    } else {
      --actDepth
      scheduleTeardownIfRequired()
      if (isTopLevelAct && asyncActs.size === 0) {
        commit()
      }
    }

    return batch.promise.then(() => result)
  }

  return [[get, subscribe], identitySelector, act]
}

const callChangeListener = ([listener]: readonly [
  (() => void)?,
  (() => void)?,
]) => {
  try {
    if (listener) {
      listener()
    }
  } catch (errorOrPromise) {
    // Given callbacks will call `getSnapshot()`, which often throws a promise,
    // let's ignore thrown promises so that the callback don't have to.
    if (!isPromiseLike(errorOrPromise)) {
      throw errorOrPromise
    }
  }
}
