declare global {
  export interface Entity {
    /** Unique ID of the entity */
    id: number;
    /**
     * Resolved properties (merged from prototype and instance).
     * Contains arbitrary game data like description, adjectives, custom_css.
     */
    [key: string]: unknown;
  }

  /**
   * Represents a scriptable action (verb) attached to an entity.
   */
  export interface Verb {
    id: number;
    entity_id: number;
    /** The name of the verb (command) */
    name: string;
    /** The compiled S-expression code for the verb */
    code: ScriptValue<unknown>;
    /** Permission settings for the verb */
    permissions: Record<string, unknown>;
  }

  export interface Capability {
    readonly __brand: "Capability";
    readonly id: string;
  }

  type UnknownUnion =
    | string
    | number
    | boolean
    | null
    | undefined
    | Capability
    | (Record<string, unknown> & { readonly length?: never })
    | (Record<string, unknown> & { readonly slice?: never });

  export type ScriptValue_<T> = Exclude<T, readonly unknown[]>;

  /**
   * Represents a value in the scripting language.
   * Can be a primitive, an object, or a nested S-expression (array).
   */
  export type ScriptValue<T> =
    | (unknown extends T
        ? ScriptValue_<UnknownUnion>
        : object extends T
          ? Extract<ScriptValue_<UnknownUnion>, object>
          : ScriptValue_<T>)
    | ScriptExpression<any[], T>;

  // Phantom type for return type safety
  export type ScriptExpression<Args extends (string | ScriptValue_<unknown>)[], Ret> = [
    string,
    ...Args,
  ] & {
    __returnType: Ret;
  };

  // Standard library functions
  function add(a: number, b: number, ...args: number[]): number;
  function div(a: number, b: number, ...args: number[]): number;
  function mod(a: number, b: number): number;
  function mul(a: number, b: number, ...args: number[]): number;
  function pow(base: number, exp: number, ...args: number[]): number;
  function random(min?: number, max?: number): number;
  function sub(a: number, b: number, ...args: number[]): number;
  function and(a: unknown, b: unknown, ...args: unknown[]): boolean;
  function eq(a: unknown, b: unknown, ...args: unknown[]): boolean;
  function gt(a: number, b: number, ...args: number[]): boolean;
  function gte(a: number, b: number, ...args: number[]): boolean;
  function lt(a: number, b: number, ...args: number[]): boolean;
  function lte(a: number, b: number, ...args: number[]): boolean;
  function neq(a: unknown, b: unknown, ...args: unknown[]): boolean;
  function not(val: any): boolean;
  function or(a: unknown, b: unknown, ...args: unknown[]): boolean;
  function apply(func: unknown, ...args: any[]): any;
  function arg<T>(index: number): T;
  function args(): readonly any[];
  function caller(): Entity;
  function for_(variableName: string, list: any, body: any): any;
  function if_<T>(condition: unknown, then: T, else_?: T): T;
  function lambda(args: string[], body: any): any;
  function let_(name: string, value: unknown): any;
  function log(message: unknown, ...args: unknown[]): null;
  function quote(value: any): any;
  function send(type_: string, payload: unknown): null;
  function seq(...args: any[]): any;
  function set(name: string, value: unknown): any;
  function this_(): Entity;
  function throw_(message: unknown): never;
  function try_(try_: any, errorVar: string, catch_: any): any;
  function typeof_(value: unknown): string;
  function var_(name: string): any;
  function warn(message: unknown): void;
  function while_(condition: any, body: any): any;
  namespace list {
    function concat(list1: readonly unknown[], list2: readonly unknown[]): any[];
    function empty(list: readonly unknown[]): boolean;
    function filter(list: readonly unknown[], lambda: object): any[];
    function find(list: readonly unknown[], lambda: object): any;
    function flatMap(list: readonly unknown[], lambda: object): any[];
    function get(list: readonly unknown[], index: number): any;
    function includes(list: readonly unknown[], value: any): boolean;
    function len(list: readonly unknown[]): number;
    function map(list: readonly unknown[], lambda: object): any[];
    function new_<T>(...args: any[]): T[];
    function pop(list: readonly unknown[]): any;
    function push(list: readonly unknown[], value: any): number;
    function reduce(list: readonly unknown[], lambda: object, init: any): any;
    function reverse(list: readonly unknown[]): any[];
    function set(list: readonly unknown[], index: number, value: any): any;
    function shift(list: readonly unknown[]): any;
    function slice(list: readonly unknown[], start: number, end?: number): any[];
    function sort(list: readonly unknown[]): any[];
    function splice(
      list: readonly unknown[],
      start: number,
      deleteCount: number,
      ...items: any[]
    ): any[];
    function unshift(list: readonly unknown[], value: any): number;
  }
  namespace obj {
    function del(object: object, key: string): boolean;
    function entries(object: object): [string, any][];
    function filter(object: object, lambda: object): any;
    function flatMap(object: object, lambda: object): any;
    function get(object: object, key: string, default_?: any): any;
    function has(object: object, key: string): boolean;
    function keys(object: object): string[];
    function map(object: object, lambda: object): any;
    function merge(...objects: object[]): any;
    function new_<Kvs extends [] | readonly (readonly [key: "" | (string & {}), value: unknown])[]>(
      ...kvs: any[]
    ): {
      [K in keyof Kvs & `${number}` as (Kvs[K] & [string, unknown])[0]]: (Kvs[K] &
        [string, unknown])[1];
    };
    function reduce(object: object, lambda: object, init: any): any;
    function set(object: object, key: string, value: any): any;
    function values(object: object): any[];
  }
  namespace str {
    function concat(...strings: any[]): string;
    function includes(string: string, search: string): boolean;
    function join(list: any[], separator: string): string;
    function len(string: string): number;
    function lower(string: string): string;
    function replace(string: string, search: string, replace: string): string;
    function slice(string: string, start: number, end?: number): string;
    function split(string: string, separator: string): string[];
    function trim(string: string): string;
    function upper(string: string): string;
  }
  namespace time {
    function format(time: string, format?: string): string;
    function from_timestamp(timestamp: number): string;
    function now(): string;
    function offset(amount: number, unit: string, base?: string): string;
    function parse(time: string): string;
    function to_timestamp(time: string): number;
  }
  namespace json {
    function parse(string: string): unknown;
    function stringify(value: unknown): string;
  }
}

export {};
