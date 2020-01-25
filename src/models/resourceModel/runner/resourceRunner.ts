import { Reducer, Store, StoreEnhancer, StoreEnhancerStoreCreator } from 'redux'

import { ResourceAction, ResourceState, ResourceTaskConfig } from '../types'

import { ResourceTaskRunner } from './taskRunner'

export interface RunnerConfig<Data, Rejection> {
  tasks: ResourceTaskConfig<Data, Rejection>
}

export function createResourceRunner<Data, Rejection>(
  config: RunnerConfig<Data, Rejection>,
) {
  const enhancer = (createStore: StoreEnhancerStoreCreator) => (
    reducer: Reducer<
      ResourceState<Data, Rejection>,
      ResourceAction<Data, Rejection>
    >,
    ...args: any[]
  ) => {
    const store = createStore(reducer, ...args) as Store<
      ResourceState<Data, Rejection>,
      ResourceAction<Data, Rejection>
    >

    let depth = 0
    let processing = false

    let pendingTasks: ResourceState<Data, Rejection>['tasks']['pending']
    let taskQueue: ResourceState<Data, Rejection>['tasks']['queue'] = {}
    let taskQueueIds: string[]

    const dispatch = (action: ResourceAction<Data, Rejection>) => {
      ++depth
      store.dispatch(action)
      --depth

      // The `dispatch` function calls any listeners before completing, which
      // can in turn recursively call `dispatch`. With this in mind, let's wait
      // until the initial dispatch completes before processing any tasks.
      if (depth === 0) {
        const state = store.getState()

        pendingTasks = state.tasks.pending
        taskQueue = {
          ...taskQueue,
          ...state.tasks.queue,
        }
        taskQueueIds = Object.keys(taskQueue)

        store.dispatch({ type: 'clearQueue' })

        // Tasks/effects can synchronously dispatch further actions, and we only
        // want to process those jobs on the outermost dispatch.
        if (!processing) {
          processing = true

          while (taskQueueIds.length) {
            // Run a task
            const taskId = taskQueueIds.shift()!
            const task = pendingTasks[taskId]
            const queueType = taskQueue[taskId]

            delete taskQueue[taskId]

            if (task && queueType === 'start') {
              taskRunner.start(task)
            } else {
              // Just stop paused tasks for now.
              taskRunner.stop(taskId)
            }
          }

          processing = false
        }
      }
    }

    const taskRunner = new ResourceTaskRunner(config.tasks, dispatch)

    return {
      ...store,
      dispatch,
    }
  }

  return enhancer as StoreEnhancer
}
