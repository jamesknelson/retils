export const Root = Symbol('basePath')
export type RootType = typeof Root

// TODO: allow for nested types, using template literal types, e.g.
// https://github.com/millsp/ts-toolbelt/blob/master/sources/Function/AutoPath.ts
type ObjectPaths<Value extends object = any> = Extract<keyof Value, string>

export type IssueCodes = Record<string | RootType, string>

export type DefaultIssueCodes<Value extends object = any> = Record<
  ObjectPaths<Value> | RootType,
  string
>

export type IssuePath<Codes extends IssueCodes = IssueCodes> = Extract<
  keyof Codes,
  string
>

export type Validator<
  Value extends object = any,
  Codes extends IssueCodes = DefaultIssueCodes<Value>,
> = (data: Value, paths?: IssuePath<Codes>[]) => ValidatorIssues<Value, Codes>

export type AsyncValidator<
  Value extends object = any,
  Codes extends IssueCodes = DefaultIssueCodes<Value>,
> = (
  data: Value,
  paths?: IssuePath<Codes>[],
) => Promise<ValidatorIssues<Value, Codes>>

export type ValidatorIssue<
  Value extends object = any,
  Codes extends IssueCodes = DefaultIssueCodes<Value>,
  Path extends IssuePath<Codes> | RootType = IssuePath<Codes> | RootType,
> =
  | {
      message: string
      code?: Codes[Path]
      path?: Extract<Path, string>
    }
  | {
      message?: string
      code: Codes[Path]
      path?: Extract<Path, string>
    }

export type ValidatorIssues<
  Value extends object = any,
  Codes extends IssueCodes = DefaultIssueCodes<Value>,
  Path extends IssuePath<Codes> | RootType = IssuePath<Codes> | RootType,
> =
  | null
  | (
      | ValidatorIssue<Value, Codes, Path>
      | Codes[Path]
      | false
      | null
      | undefined
    )[]
  | { [P in Path]?: ValidatorIssues<Value, Codes, P> }

export type IssueKey = string | number | symbol | object | Validator<any>

// TODO:
// This type is actuallyu more correct, as it lets us discriminate between
// codes at different paths. However, it currently breaks the types for
// useIssues.
//
// export type Issue<
//   Value extends object = any,
//   Codes extends IssueCodes = DefaultIssueCodes<Value>,
//   Path extends IssuePath<Codes> | RootType = IssuePath<Codes> | RootType,
// > = {
//   [P in Path]: {
//     message: string
//     code: Codes[P extends never ? RootType : P]
//     key: IssueKey
//     value: Value

//     // This will be undefined in the case of a base path
//     path: P extends string ? P : undefined
//   }
// }[Path]
export interface Issue<
  Value extends object = any,
  Codes extends IssueCodes = DefaultIssueCodes<Value>,
  Path extends IssuePath<Codes> | RootType = IssuePath<Codes> | RootType,
> {
  message: string
  code: Codes[Path extends never ? RootType : Path]
  key: IssueKey
  value: Value

  // This will be undefined in the case of a base path
  path?: Extract<Path, string>
}

export interface AddIssuesFunction<
  Value extends object,
  Codes extends IssueCodes = DefaultIssueCodes<Value>,
> {
  <I extends Readonly<ValidatorIssues<Value, Codes>>>(
    issues: I,
    options?: {
      // For individual issues, any change from this value will result in the
      // issues being removed.
      value?: Value

      // If provided, the result of this validator for this path will override
      // the result of any previous validator with the same key. By default,
      // the validator itself will be used as the key.
      key?: IssueKey
    },
  ): readonly [removeIssues: () => void, resultPromise: Promise<boolean>]

  /**
   * Add issues specified as a function of the current data. Any issues will
   * be applied to the issue object until resolved, and then the validator
   * will be cached and re-run while valid. It'll be automatically removed
   * if the validator changes from valid to invalid.
   *
   * The return is a promise, as the actual logic happens within a reducer
   * that may not be immediately called. If the validation logic cannot be
   * called due to the component unmountind, the returned promise will be
   * rejected.
   */
  (
    validator: Validator<Value, Codes>,
    options?: {
      // If provided, the result of this validator for this path will override
      // the result of any previous validator with the same key. By default,
      // the validator itself will be used as the key.
      key?: IssueKey

      // If provided, the path will be provided to the validator, and the result
      // of the validator will be filtered such that only issues with this path
      // are handled.
      path?: IssuePath<Codes>
    },
  ): readonly [removeIssues: () => void, resultPromise: Promise<boolean>]
}

/**
 * Clears any validators and results associated with the given key. If no key
 * or validator is given, all validators and results will be cleared.
 */
export type ClearIssuesFunction = (key?: IssueKey) => void

export type GetIssueMessage<
  Value extends object = any,
  Codes extends IssueCodes = DefaultIssueCodes<Value>,
> = (
  issue: Omit<Issue<Value, Codes>, 'message'> & { message?: string },
) => string
