import { useEffect, useMemo, useRef, useState } from 'react'
import { HistoryService } from 'retil-history'

import {
  RouterController,
  RouterFunction,
  RouterHistoryState,
  RouterRequest,
  RouterResponse,
  RouterSnapshot,
  Route,
} from '../routerTypes'

import { createRouter } from '../routerService'
import { useRouterService } from './useRouterService'

export interface UseRouterOptions<
  Ext = {},
  State extends RouterHistoryState = RouterHistoryState,
  Response extends RouterResponse = RouterResponse
> {
  basename?: string

  history?: HistoryService<State>

  initialSnapshot?: RouterSnapshot<Ext, State, Response>

  /**
   * Called when a complete response object becomes available.
   */
  onResponseComplete?: (
    response: Response,
    request: RouterRequest<State> & Ext,
  ) => void

  transformRequest?: (
    request: RouterRequest<State>,
  ) => RouterRequest<State> & Ext

  transitionTimeoutMs?: number

  unstable_isConcurrent?: boolean
}

export function useRouter<
  Ext = {},
  State extends RouterHistoryState = RouterHistoryState,
  Response extends RouterResponse = RouterResponse
>(
  routerFunction: RouterFunction<RouterRequest<State> & Ext, Response>,
  options: UseRouterOptions<Ext, State, Response> = {},
): readonly [Route<Ext, State>, RouterController<Ext, State, Response>] {
  const {
    basename,
    history,
    initialSnapshot,
    onResponseComplete,
    transformRequest,
    transitionTimeoutMs,
    unstable_isConcurrent,
  } = options

  const onResponseCompleteRef = useRef(onResponseComplete)
  onResponseCompleteRef.current = onResponseComplete

  const [snapshotToUse, setSnapshotToUse] = useState(initialSnapshot || null)

  const routerServiceOrSnapshot = useMemo(
    () =>
      snapshotToUse ||
      createRouter(routerFunction, {
        basename,
        history,
        transformRequest,
      }),
    [basename, history, routerFunction, snapshotToUse, transformRequest],
  )

  useEffect(() => {
    if (initialSnapshot) {
      setSnapshotToUse(null)
    }
    // We only want this to be called on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return useRouterService(routerServiceOrSnapshot, {
    transitionTimeoutMs,
    unstable_isConcurrent,
  })
}
