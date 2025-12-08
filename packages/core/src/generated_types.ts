// oxlint-disable max-params, ban-types
declare global {
  /** Represents a scriptable action (verb) attached to an entity. */
  interface Verb {
    id: number;
    entity_id: number;
    /** The name of the verb (command) */
    name: string;
    /** The compiled S-expression code for the verb */
    code: ScriptValue<unknown>;
  }

  const RAW_MARKER: unique symbol;
  interface ScriptRaw<Type> {
    [RAW_MARKER]: Type;
  }

  interface Capability {
    readonly __brand: "Capability";
    readonly id: string;
    readonly ownerId: number;
  }

  type UnionToIntersection<Type> = (Type extends Type ? (type: Type) => 0 : never) extends (
    intersection: infer Intersection,
  ) => 0
    ? Extract<Intersection, Type>
    : never;

  type UnknownUnion =
    | string
    | number
    | boolean
    | null
    | undefined
    | Capability
    | (Record<string, unknown> & { readonly length?: never })
    | (Record<string, unknown> & { readonly slice?: never });

  type ScriptValue_<Type> = Exclude<Type, readonly unknown[]>;

  /**
   * Represents a value in the scripting language.
   * Can be a primitive, an object, or a nested S-expression (array).
   */
  type ScriptValue<Type> =
    | (unknown extends Type
        ? ScriptValue_<UnknownUnion>
        : object extends Type
          ? Extract<ScriptValue_<UnknownUnion>, object>
          : ScriptValue_<Type>)
    | ScriptExpression<any[], Type>;

  // Phantom type for return type safety
  type ScriptExpression<Args extends (string | ScriptValue_<unknown>)[], Result> = [
    string,
    ...Args,
  ] & {
    __returnType: Result;
  };

  interface OpcodeParameter {
    name: string;
    type: string;
    optional?: boolean;
    description?: string;
  }

  interface FullOpcodeParameter extends OpcodeParameter {
    description: string;
  }

  /** Metadata describing an opcode for documentation and UI generation. */
  interface OpcodeMetadata<Lazy extends boolean = boolean, Full extends boolean = false> {
    /** Human-readable label. */
    label: string;
    /** The opcode name. */
    opcode: string;
    /** Category for grouping. */
    category: string;
    /** Description of what the opcode does. */
    description?: string;
    // For Node Editor
    layout?: "infix" | "standard" | "primitive" | "control-flow";
    slots?: {
      name: string;
      type: "block" | "string" | "number" | "boolean";
      default?: any;
    }[];
    // For Monaco/TS
    parameters?: readonly (Full extends true ? FullOpcodeParameter : OpcodeParameter)[];
    genericParameters?: string[];
    returnType?: string;
    /** If true, arguments are NOT evaluated before being passed to the handler. Default: false (Strict). */
    lazy?: Lazy;
  }

  interface FullOpcodeMetadata<Lazy extends boolean = boolean>
    extends
      Omit<OpcodeMetadata<Lazy, true>, "slots" | "description" | "parameters" | "returnType">,
      Required<
        Pick<OpcodeMetadata<Lazy, true>, "slots" | "description" | "parameters" | "returnType">
      > {}

  type OpcodeHandler<Args extends readonly unknown[], Ret, Lazy extends boolean = boolean> = (
    args: {
      [Key in keyof Args]: Args[Key] extends ScriptRaw<infer Type>
        ? Type
        : Lazy extends true
          ? ScriptValue<Args[Key]>
          : Args[Key];
    },
    ctx: ScriptContext,
  ) => Ret | Promise<Ret>;

  type IsAny<Type> = 0 extends 1 & Type ? true : false;

  interface OpcodeBuilder<
    Args extends (string | ScriptValue_<unknown>)[],
    Ret,
    Lazy extends boolean = boolean,
  > {
    (
      ...args: IsAny<Args> extends true
        ? any
        : {
            [Key in keyof Args]: Args[Key] extends ScriptRaw<infer Type>
              ? Type
              : ScriptValue<Args[Key]>;
          }
    ): ScriptExpression<Args, Ret>;
    opcode: string;
    handler: OpcodeHandler<Args, Ret, Lazy>;
    metadata: OpcodeMetadata<Lazy>;
  }

  interface StackFrame {
    name: string;
    args: unknown[];
  }

  interface ScriptContext {
    /** The entity that initiated the script execution. */
    readonly caller: Entity;
    /** The entity the script is currently attached to/executing on. */
    readonly this: Entity;
    /** Arguments passed to the script. */
    readonly args: readonly unknown[];
    /** Gas limit to prevent infinite loops. */
    gas: number;
    /** Function to send messages back to the caller. */
    readonly send?: (type: string, payload: unknown) => void;
    /** List of warnings generated during execution. */
    readonly warnings: string[];
    /** Copy-On-Write flag for scope forking. */
    cow: boolean;
    /** Local variables in the current scope. */
    vars: Record<string, unknown>;
    /** Call stack for error reporting. */
    readonly stack: StackFrame[];
    /** Opcode registry for this context. */
    readonly ops: Record<string, OpcodeBuilder<any[], any>>;
  }

  // Standard library functions
  class Entity {
    id: number;
    prototype_id: number;
    has_verb(name: string): boolean;
    toJSON(): this;
  }

  class EntityControl {
    destroy(targetId: number): boolean;
  }

  /**
   * Call a verb on an entity
   *
   * @param target The entity to call.
   * @param verb The verb to call.
   * @param args Arguments to pass to the verb.
   */
  function call(target: Entity, verb: string, ...args: any[]): any;
  /**
   * Create a new entity (requires sys.create)
   *
   * @param capability Capability to use for creation
   * @param data Initial data for the entity
   */
  function create(capability: Capability | null, data: object): number;
  /**
   * Destroy an entity (requires entity.control)
   *
   * @param capability Capability to use.
   * @param target The entity to destroy.
   */
  function destroy(capability: Capability | null, target: Entity): null;
  /**
   * Get entity by ID
   *
   * @param id The ID of the entity.
   */
  function entity(id: number): Entity;
  /**
   * Get entity prototype ID
   *
   * @param target The entity to get the prototype of.
   */
  function get_prototype(target: Entity): number | null;
  /**
   * Get specific verb
   *
   * @param target The entity to get the verb from.
   * @param name The name of the verb.
   */
  function get_verb(target: Entity, name: string): Verb | null;
  /**
   * Resolve entity properties
   *
   * @param target The entity to resolve properties for.
   */
  function resolve_props(target: Entity): Entity;
  /**
   * Schedule a verb call
   *
   * @param verb The verb to schedule.
   * @param args Arguments to pass to the verb.
   * @param delay Delay in milliseconds.
   */
  function schedule(verb: string, args: any[], delay: number): null;
  /**
   * Update entity properties (requires entity.control)
   *
   * @param capability Capability to use.
   * @param target The entity to update.
   * @param updates The properties to update.
   */
  function set_entity(capability: Capability | null, target: Entity, updates: object): Entity;
  /**
   * Set entity prototype (requires entity.control)
   *
   * @param capability Capability to use.
   * @param target The entity to set the prototype of.
   * @param prototypeId The ID of the new prototype.
   */
  function set_prototype(capability: Capability | null, target: Entity, prototypeId: number): null;
  /**
   * Execute verb as another entity (requires sys.sudo)
   *
   * @param capability Capability to use.
   * @param target The entity to impersonate.
   * @param verb The verb to call.
   * @param args Arguments to pass to the verb.
   */
  function sudo(capability: Capability | null, target: Entity, verb: string, args: any[]): any;
  /**
   * Get available verbs
   *
   * @param target The entity to get verbs from.
   */
  function verbs(target: Entity): Verb[];
  /**
   * Create a restricted version of a capability
   *
   * @param parent The parent capability.
   * @param restrictions The restrictions to apply.
   */
  function delegate(parent: object, restrictions: object): Capability;
  /**
   * Retrieve a capability owned by the current entity
   *
   * @param type The capability type.
   * @param filter Filter parameters.
   */
  function get_capability(type_: string, filter?: object): Capability | null;
  /**
   * Transfer a capability to another entity
   *
   * @param cap The capability to give.
   * @param target The target entity.
   */
  function give_capability(cap: object, target: object): null;
  /**
   * Check if an entity has a capability
   *
   * @param target The target entity.
   * @param type The capability type.
   * @param filter Filter parameters.
   */
  function has_capability(target: object, type_: string, filter?: object): boolean;
  /**
   * Mint a new capability (requires sys.mint)
   *
   * @param authority The authority capability.
   * @param type The capability type to mint.
   * @param params The capability parameters.
   */
  function mint(authority: object, type_: string, params: object): Capability;
  /**
   * Adds numbers.
   *
   * @param left The first number.
   * @param right The second number.
   * @param args Additional numbers to add.
   */
  function add(left: number, right: number, ...args: number[]): number;
  /**
   * Divides numbers.
   *
   * @param left The dividend.
   * @param right The divisor.
   * @param args Additional divisors.
   */
  function div(left: number, right: number, ...args: number[]): number;
  /**
   * Calculates the modulo of two numbers.
   *
   * @param left The dividend.
   * @param right The divisor.
   */
  function mod(left: number, right: number): number;
  /**
   * Multiplies numbers.
   *
   * @param left The first number.
   * @param right The second number.
   * @param args Additional numbers to multiply.
   */
  function mul(left: number, right: number, ...args: number[]): number;
  /**
   * Calculates exponentiation (power tower).
   *
   * @param base The base number.
   * @param exp The exponent.
   * @param args Additional exponents.
   */
  function pow(base: number, exp: number, ...args: number[]): number;
  /**
   * Subtracts numbers.
   *
   * @param left The number to subtract from.
   * @param right The number to subtract.
   * @param args Additional numbers to subtract.
   */
  function sub(left: number, right: number, ...args: number[]): number;
  /**
   * Logical AND. Returns true if all arguments are true.
   *
   * @param left The first value.
   * @param right The second value.
   * @param args Additional values.
   */
  function and(left: unknown, right: unknown, ...args: unknown[]): boolean;
  /**
   * Checks if all arguments are equal.
   *
   * @param left The first value to compare.
   * @param right The second value to compare.
   * @param args Additional values to compare.
   */
  function eq(left: unknown, right: unknown, ...args: unknown[]): boolean;
  /**
   * Checks if arguments are strictly decreasing.
   *
   * @param left The first number.
   * @param right The second number.
   * @param args Additional numbers.
   */
  function gt(left: number, right: number, ...args: number[]): boolean;
  /**
   * Checks if arguments are non-increasing.
   *
   * @param left The first number.
   * @param right The second number.
   * @param args Additional numbers.
   */
  function gte(left: number, right: number, ...args: number[]): boolean;
  /**
   * Checks if arguments are strictly increasing.
   *
   * @param left The first number.
   * @param right The second number.
   * @param args Additional numbers.
   */
  function lt(left: number, right: number, ...args: number[]): boolean;
  /**
   * Checks if arguments are non-decreasing.
   *
   * @param left The first number.
   * @param right The second number.
   * @param args Additional numbers.
   */
  function lte(left: number, right: number, ...args: number[]): boolean;
  /**
   * Checks if adjacent arguments are different.
   *
   * @param left The first value to compare.
   * @param right The second value to compare.
   * @param args Additional values to compare.
   */
  function neq(left: unknown, right: unknown, ...args: unknown[]): boolean;
  /**
   * Logical NOT. Returns the opposite boolean value.
   *
   * @param value The boolean value to negate.
   */
  function not(value: unknown): boolean;
  /**
   * Logical OR. Returns true if at least one argument is true.
   *
   * @param left The first value.
   * @param right The second value.
   * @param args Additional values.
   */
  function or(left: unknown, right: unknown, ...args: unknown[]): boolean;
  /**
   * Sends a system message to the client.
   *
   * @param type The message type.
   * @param payload The message payload.
   */
  function send(type_: string, payload: unknown): null;
  namespace math {
    /**
     * Returns the absolute value of a number.
     *
     * @param num The number.
     */
    function abs(num: number): number;
    /**
     * Returns the arccosine of a number.
     *
     * @param num The number.
     */
    function acos(num: number): number;
    /**
     * Returns the arcsine of a number.
     *
     * @param num The number.
     */
    function asin(num: number): number;
    /**
     * Returns the arctangent of a number.
     *
     * @param num The number.
     */
    function atan(num: number): number;
    /**
     * Returns the angle (in radians) from the X axis to a point.
     *
     * @param dy The y coordinate.
     * @param dx The x coordinate.
     */
    function atan2(dy: number, dx: number): number;
    /**
     * Rounds up a number.
     *
     * @param num The number to ceil.
     */
    function ceil(num: number): number;
    /**
     * Clamps a number between a minimum and maximum value.
     *
     * @param val The value to clamp.
     * @param min The minimum value.
     * @param max The maximum value.
     */
    function clamp(val: number, min: number, max: number): number;
    /**
     * Returns the cosine of a number.
     *
     * @param angle The angle in radians.
     */
    function cos(angle: number): number;
    /**
     * Returns e raised to the power of a number.
     *
     * @param num The exponent.
     */
    function exp(num: number): number;
    /**
     * Rounds down a number.
     *
     * @param num The number to floor.
     */
    function floor(num: number): number;
    /**
     * Returns the natural logarithm (base e) of a number.
     *
     * @param num The number.
     */
    function log(num: number): number;
    /**
     * Returns the base 10 logarithm of a number.
     *
     * @param num The number.
     */
    function log10(num: number): number;
    /**
     * Returns the base 2 logarithm of a number.
     *
     * @param num The number.
     */
    function log2(num: number): number;
    /**
     * Returns the largest of the given numbers.
     *
     * @param arg0 First number.
     * @param args Additional numbers.
     */
    function max(arg0: number, ...args: number[]): number;
    /**
     * Returns the smallest of the given numbers.
     *
     * @param arg0 First number.
     * @param args Additional numbers.
     */
    function min(arg0: number, ...args: number[]): number;
    /**
     * Rounds a number to the nearest integer.
     *
     * @param num The number to round.
     */
    function round(num: number): number;
    /**
     * Returns the sign of a number, indicating whether the number is positive, negative or zero.
     *
     * @param num The number.
     */
    function sign(num: number): number;
    /**
     * Returns the sine of a number.
     *
     * @param angle The angle in radians.
     */
    function sin(angle: number): number;
    /**
     * Returns the square root of a number.
     *
     * @param num The number.
     */
    function sqrt(num: number): number;
    /**
     * Returns the tangent of a number.
     *
     * @param angle The angle in radians.
     */
    function tan(angle: number): number;
    /**
     * Returns the integer part of a number.
     *
     * @param num The number to truncate.
     */
    function trunc(num: number): number;
  }
  namespace list {
    /**
     * Merges two or more lists.
     *
     * @param lists The lists to concatenate.
     */
    function concat<Type>(...lists: (readonly Type[])[]): Type[];
    /**
     * Checks if the list has no items.
     *
     * @param list The list to check.
     */
    function empty(list: readonly unknown[]): boolean;
    /**
     * Creates a shallow copy of a portion of a given list, filtered down to just the elements from the given list that pass the test implemented by the provided function.
     *
     * @param list The list to filter.
     * @param lambda The testing function.
     */
    function filter<Type>(list: Type[], lambda: (item: Type) => boolean): Type[];
    /**
     * Returns the first element in the provided list that satisfies the provided testing function.
     *
     * @param list The list to search.
     * @param lambda The testing function.
     */
    function find<Type>(list: Type[], lambda: (value: Type) => boolean): Type;
    /**
     * Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level.
     *
     * @param list The list to map.
     * @param lambda The mapping function.
     */
    function flatMap<Type, Result>(
      list: readonly Type[],
      lambda: (item: Type) => Result[],
    ): Result[];
    /**
     * Retrieves the item at the specified index.
     *
     * @param list The list to access.
     * @param index The index of the item.
     */
    function get<Type>(list: Type[], index: number): Type | undefined;
    /**
     * Determines whether a list includes a certain value.
     *
     * @param list The list to check.
     * @param value The value to search for.
     */
    function includes<Type>(list: readonly Type[], value: Type): boolean;
    /**
     * Returns the number of items in the list.
     *
     * @param list The list to check.
     */
    function len(list: readonly unknown[]): number;
    /**
     * Creates a new list populated with the results of calling a provided function on each element in the calling list.
     *
     * @param list The list to map.
     * @param lambda The mapping function.
     */
    function map<Type, Result>(list: Type[], lambda: (value: Type) => Result): Result[];
    /**
     * Creates a new list from the provided arguments.
     *
     * @param items The items to include in the list.
     */
    function new_<Type>(...items: unknown[]): Type[];
    /**
     * Removes and returns the last item of the list.
     *
     * @param list The list to modify.
     */
    function pop<Type>(list: Type[]): Type;
    /**
     * Adds an item to the end of the list.
     *
     * @param list The list to modify.
     * @param value The item to add.
     */
    function push<Type>(list: Type[], value: Type): number;
    /**
     * Executes a user-supplied 'reducer' callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element.
     *
     * @param list The list to reduce.
     * @param lambda The reducer function.
     * @param initialValue The initial value.
     */
    function reduce<Type, Result>(
      list: readonly Type[],
      lambda: (acc: Result, item: Type) => Result,
      initialValue: Result,
    ): Result;
    /**
     * Reverses a list in place.
     *
     * @param list The list to reverse.
     */
    function reverse<Type>(list: readonly Type[]): Type[];
    /**
     * Sets the item at the specified index.
     *
     * @param list The list to modify.
     * @param index The index to set.
     * @param value The new value.
     */
    function set<Type>(list: Type[], index: number, value: Type): Type;
    /**
     * Removes and returns the first item of the list.
     *
     * @param list The list to modify.
     */
    function shift<Type>(list: Type[]): Type;
    /**
     * Returns a shallow copy of a portion of the list.
     *
     * @param list The list to slice.
     * @param start The start index.
     * @param end The end index (exclusive).
     */
    function slice<Type>(list: readonly Type[], start: number, end?: number): Type[];
    /**
     * Sorts the elements of a list in place.
     *
     * @param list The list to sort.
     */
    function sort<Type>(list: Type[]): Type[];
    /**
     * Changes the contents of a list by removing or replacing existing elements and/or adding new elements.
     *
     * @param list The list to modify.
     * @param start The start index.
     * @param deleteCount The number of items to remove.
     * @param items The items to add.
     */
    function splice<Type>(
      list: Type[],
      start: number,
      deleteCount: number,
      ...items: Type[]
    ): Type[];
    /**
     * Adds an item to the beginning of the list.
     *
     * @param list The list to modify.
     * @param value The item to add.
     */
    function unshift<Type>(list: Type[], value: Type): number;
  }
  namespace obj {
    /**
     * Deletes a property from an object.
     *
     * @param object The object to modify.
     * @param key The property key.
     */
    function del<Type, Key extends keyof Type = keyof Type>(object: Type, key: Key): boolean;
    /**
     * Returns an array of a given object's own enumerable string-keyed property [key, value] pairs.
     *
     * @param object The object to get entries from.
     */
    function entries<Type>(
      object: Type,
    ): readonly { [Key in keyof Type]: [Key, Type[Key]] }[keyof Type][];
    /**
     * Creates a new object with a subset of properties that pass the test implemented by the provided function.
     *
     * @param object The object to filter.
     * @param lambda The testing function.
     */
    function filter<Type>(
      object: Type,
      lambda: (...kv: readonly { [Key in keyof Type]: [Key, Type[Key]] }[keyof Type][]) => boolean,
    ): Partial<Type>;
    /**
     * Creates a new object by applying a given callback function to each entry of the object, and then flattening the result.
     *
     * @param object The object to map.
     * @param lambda The mapping function.
     */
    function flatMap(object: object, lambda: object): any;
    /**
     * Retrieves a property from an object.
     *
     * @param object The object to query.
     * @param key The property key.
     * @param default The default value if the key is missing.
     */
    function get<Type, Key extends keyof Type = keyof Type>(
      object: Type,
      key: Key,
      default_?: Type[Key],
    ): Type[Key];
    /**
     * Checks if an object has a specific property.
     *
     * @param object The object to check.
     * @param key The property key.
     */
    function has<Type, Key extends keyof Type = keyof Type>(object: Type, key: Key): boolean;
    /**
     * Returns an array of a given object's own enumerable property names.
     *
     * @param object The object to get keys from.
     */
    function keys<Type>(object: Type): readonly (keyof Type)[];
    /**
     * Creates a new object with the same keys as the original, but with values transformed by a function.
     *
     * @param object The object to map.
     * @param lambda The mapping function.
     */
    function map<Type, Result>(
      object: Type,
      lambda: (...kv: readonly { [Key in keyof Type]: [Key, Type[Key]] }[keyof Type][]) => Result,
    ): Record<keyof Type, Result>;
    /**
     * Merges multiple objects into a new object.
     *
     * @param objects The objects to merge.
     */
    function merge<Ts extends object[]>(...objects: Ts): UnionToIntersection<Ts[number]>;
    /**
     * Creates a new object from key-value pairs.
     *
     * @param kvs Key-value pairs.
     */
    function new_<Kvs extends [] | readonly (readonly [key: "" | (string & {}), value: unknown])[]>(
      ...kvs: any[]
    ): {
      [Key in keyof Kvs & `${number}` as (Kvs[Key] & [string, unknown])[0]]: (Kvs[Key] &
        [string, unknown])[1];
    };
    /**
     * Executes a user-supplied 'reducer' callback function on each entry of the object.
     *
     * @param object The object to reduce.
     * @param lambda The reducer function.
     * @param init The initial value.
     */
    function reduce<Acc>(object: object, lambda: unknown, init: Acc): Acc;
    /**
     * Sets a property on an object. Returns the entire object.
     *
     * @param object The object to modify.
     * @param key The property key.
     * @param value The new value.
     */
    function set<Type, Key extends keyof Type = keyof Type>(
      object: Type,
      key: Key,
      value: Type[Key],
    ): Type;
    /**
     * Returns an array of a given object's own enumerable property values.
     *
     * @param object The object to get values from.
     */
    function values<Type>(object: Type): readonly Type[keyof Type][];
  }
  namespace str {
    /**
     * Concatenates multiple strings into one.
     *
     * @param strings The strings to concatenate.
     */
    function concat(...strings: any[]): string;
    /**
     * Checks if a string contains another string.
     *
     * @param string The string to check.
     * @param search The substring to search for.
     */
    function includes(string: string, search: string): boolean;
    /**
     * Joins elements of a list into a string using a separator.
     *
     * @param list The list to join.
     * @param separator The separator to use.
     */
    function join(list: any[], separator: string): string;
    /**
     * Returns the length of a string.
     *
     * @param string The string to measure.
     */
    function len(string: string): number;
    /**
     * Converts a string to lowercase.
     *
     * @param string The string to convert.
     */
    function lower(string: string): string;
    /**
     * Replaces occurrences of a substring with another string.
     *
     * @param string The string to search in.
     * @param search The string to search for.
     * @param replace The string to replace with.
     */
    function replace(string: string, search: string, replace?: string): string;
    /**
     * Extracts a section of a string and returns it as a new string.
     *
     * @param string The string to slice.
     * @param start The start index.
     * @param end The end index (exclusive).
     */
    function slice(string: string, start: number, end?: number): string;
    /**
     * Splits a string into an array of substrings using a separator.
     *
     * @param string The string to split.
     * @param separator The separator to split by.
     */
    function split(string: string, separator: string): string[];
    /**
     * Removes whitespace from both ends of a string.
     *
     * @param string The string to trim.
     */
    function trim(string: string): string;
    /**
     * Converts a string to uppercase.
     *
     * @param string The string to convert.
     */
    function upper(string: string): string;
  }
  namespace time {
    /**
     * Formats a timestamp string.
     *
     * @param time The timestamp to format.
     * @param format The format string (currently unused).
     */
    function format(time: string, format?: string): string;
    /**
     * Converts a numeric timestamp (ms since epoch) to an ISO 8601 string.
     *
     * @param timestamp The timestamp in milliseconds.
     */
    function from_timestamp(timestamp: number): string;
    /**
     * Returns the current time as an ISO 8601 string.
     */
    function now(): string;
    /**
     * Adds an offset to a timestamp.
     *
     * @param amount The amount to add.
     * @param unit The unit of time (e.g., 'days', 'hours').
     * @param base The base timestamp (defaults to now).
     */
    function offset(amount: number, unit: string, base?: string): string;
    /**
     * Parses a datetime string and returns it in ISO 8601 format.
     *
     * @param time The datetime string to parse.
     */
    function parse(time: string): string;
    /**
     * Converts an ISO 8601 string to a numeric timestamp (ms since epoch).
     *
     * @param time The ISO 8601 string.
     */
    function to_timestamp(time: string): number;
  }
  namespace std {
    /**
     * Calls a lambda function with the provided arguments.
     *
     * @param lambda The lambda to execute.
     * @param args The arguments.
     */
    function apply(lambda: unknown, ...args: unknown[]): any;
    /**
     * Retrieves a specific argument passed to the script.
     *
     * @param index The index of the argument.
     */
    function arg<Type>(index: number): Type;
    /**
     * Get all arguments
     */
    function args(): any[];
    /**
     * Converts a value to a boolean.
     *
     * @param value The value to convert.
     */
    function boolean(value: unknown): boolean;
    /**
     * Breaks out of the current loop.
     */
    function break_(): never;
    /**
     * Calls a method on an object, preserving context.
     *
     * @param object The object.
     * @param method The method name.
     * @param args Arguments.
     */
    function call_method(object: any, method: string, ...args: any[]): any;
    /**
     * Current caller
     */
    function caller(): Entity;
    /**
     * Skips the rest of the current loop iteration.
     */
    function continue_(): never;
    /**
     * Parses a string into a floating-point number.
     *
     * @param string The string to parse.
     */
    function float(string: string): number;
    /**
     * Iterates over a list, executing the body for each item.
     *
     * @param var The variable name.
     * @param list The list to iterate over.
     * @param block The code block to execute.
     */
    function for_(var_: string, list: any[], block: unknown): any;
    /**
     * Conditionally executes a branch based on a boolean condition.
     *
     * @param condition The condition to check.
     * @param then The code to execute if true.
     * @param else The code to execute if false.
     */
    function if_<Type>(condition: unknown, then: Type, else_?: Type): Type;
    /**
     * Parses a string into an integer.
     *
     * @param string The string to parse.
     * @param radix The radix (2-36).
     */
    function int(string: string, radix?: number): number;
    /**
     * Creates a lambda (anonymous function).
     *
     * @param args The arguments.
     * @param body The function body.
     */
    function lambda(args: unknown[], body: unknown): any;
    /**
     * Defines a local variable in the current scope.
     *
     * @param name The name of the variable.
     * @param value The initial value.
     */
    function let_(name: string, value: unknown): any;
    /**
     * Logs a message to the console/client.
     *
     * @param message The message to log.
     * @param args Additional arguments to log.
     */
    function log(message: unknown, ...args: unknown[]): null;
    /**
     * Converts a value to a number.
     *
     * @param value The value to convert.
     */
    function number(value: unknown): number;
    /**
     * Returns the argument as is, without evaluation. Used for passing arrays as values to opcodes.
     *
     * @param value The value to quote.
     */
    function quote<Type>(value: Type): Type;
    /**
     * Returns from the current function, optionally returning a value.
     *
     * @param value The value to return.
     */
    function return_(value?: any): never;
    /**
     * Executes a sequence of steps and returns the result of the last step.
     *
     * @param args The sequence of steps to execute.
     */
    function seq(...args: any[]): any;
    /**
     * Updates the value of an existing variable.
     *
     * @param name The variable name.
     * @param value The value to set.
     */
    function set(name: string, value: unknown): any;
    /**
     * Converts a value to a string.
     *
     * @param value The value to convert.
     */
    function string(value: unknown): string;
    /**
     * Current entity
     */
    function this_(): Entity;
    /**
     * Throws an error, stopping script execution.
     *
     * @param message The error message.
     */
    function throw_(message: string): never;
    /**
     * Executes a block of code and catches any errors.
     *
     * @param try The code to try executing.
     * @param errorVar The name of the variable to store the error message.
     * @param catch The code to execute if an error occurs.
     */
    function try_(try_: any, errorVar: string, catch_: any): any;
    /**
     * Returns the type of a value as a string.
     *
     * @param block The code block to execute.
     */
    function typeof_(block: unknown): string;
    /**
     * Retrieves a local variable from the current scope.
     *
     * @param name The variable name.
     */
    function var_(name: string): any;
    /**
     * Sends a warning message to the client.
     *
     * @param message The warning message.
     */
    function warn(message: string): void;
    /**
     * Repeats a body while a condition is true.
     *
     * @param condition The condition to check before each iteration.
     * @param body The code to execute in each iteration.
     */
    function while_(condition: any, body: any): any;
  }
  namespace json {
    /**
     * Parses a JSON string into a value.
     *
     * @param string The JSON string to parse.
     */
    function parse(string: string): unknown;
    /**
     * Converts a value to a JSON string.
     *
     * @param value The value to stringify.
     */
    function stringify(value: unknown): string;
  }
  namespace random {
    /**
     * Returns a random integer between min (inclusive) and max (inclusive).
     *
     * @param min The minimum value (inclusive).
     * @param max The maximum value (inclusive).
     */
    function between(min: number, max: number): number;
    /**
     * Returns a random item from a list.
     *
     * @param list The list to pick from.
     */
    function choice(list: any[]): any;
    /**
     * Returns a random floating-point number between 0 (inclusive) and 1 (exclusive).
     */
    function number(): number;
  }
}

// oxlint-disable-next-line require-module-specifiers
export {};
