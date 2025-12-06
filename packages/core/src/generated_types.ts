declare global {
  interface Entity {
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
  interface Verb {
    id: number;
    entity_id: number;
    /** The name of the verb (command) */
    name: string;
    /** The compiled S-expression code for the verb */
    code: ScriptValue<unknown>;
  }

  interface Capability {
    readonly __brand: "Capability";
    readonly id: string;
  }

  type UnionToIntersection<T> = (T extends T ? (t: T) => 0 : never) extends (i: infer I) => 0
    ? Extract<I, T>
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

  type ScriptValue_<T> = Exclude<T, readonly unknown[]>;

  /**
   * Represents a value in the scripting language.
   * Can be a primitive, an object, or a nested S-expression (array).
   */
  type ScriptValue<T> =
    | (unknown extends T
        ? ScriptValue_<UnknownUnion>
        : object extends T
          ? Extract<ScriptValue_<UnknownUnion>, object>
          : ScriptValue_<T>)
    | ScriptExpression<any[], T>;

  // Phantom type for return type safety
  type ScriptExpression<Args extends (string | ScriptValue_<unknown>)[], Ret> = [
    string,
    ...Args,
  ] & {
    __returnType: Ret;
  };

  // Standard library functions
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
   * @param cap Capability to use for creation
   * @param data Initial data for the entity
   */
  function create(cap: Capability | null, data: object): number;
  /**
   * Destroy an entity (requires entity.control)
   *
   * @param cap Capability to use.
   * @param target The entity to destroy.
   */
  function destroy(cap: Capability | null, target: Entity): null;
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
   * @param cap Capability to use.
   * @param entities The entities to update.
   */
  function set_entity(cap: Capability | null, ...entities: object[]): void;
  /**
   * Set entity prototype (requires entity.control)
   *
   * @param cap Capability to use.
   * @param target The entity to set the prototype of.
   * @param prototypeId The ID of the new prototype.
   */
  function set_prototype(cap: Capability | null, target: Entity, prototypeId: number): null;
  /**
   * Execute verb as another entity (requires sys.sudo)
   *
   * @param cap Capability to use.
   * @param target The entity to impersonate.
   * @param verb The verb to call.
   * @param args Arguments to pass to the verb.
   */
  function sudo(cap: Capability | null, target: Entity, verb: string, args: any[]): any;
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
   * @param a The first number.
   * @param b The second number.
   * @param args Additional numbers to add.
   */
  function add(a: number, b: number, ...args: number[]): number;
  /**
   * Divides numbers.
   *
   * @param a The dividend.
   * @param b The divisor.
   * @param args Additional divisors.
   */
  function div(a: number, b: number, ...args: number[]): number;
  /**
   * Calculates the modulo of two numbers.
   *
   * @param a The dividend.
   * @param b The divisor.
   */
  function mod(a: number, b: number): number;
  /**
   * Multiplies numbers.
   *
   * @param a The first number.
   * @param b The second number.
   * @param args Additional numbers to multiply.
   */
  function mul(a: number, b: number, ...args: number[]): number;
  /**
   * Calculates exponentiation (power tower).
   *
   * @param base The base number.
   * @param exp The exponent.
   * @param args Additional exponents.
   */
  function pow(base: number, exp: number, ...args: number[]): number;
  /**
   * Generates a random number.
   *
   * @param min The minimum value (inclusive).
   * @param max The maximum value (inclusive).
   */
  function random(min?: number, max?: number): number;
  /**
   * Subtracts numbers.
   *
   * @param a The number to subtract from.
   * @param b The number to subtract.
   * @param args Additional numbers to subtract.
   */
  function sub(a: number, b: number, ...args: number[]): number;
  /**
   * Logical AND. Returns true if all arguments are true.
   *
   * @param a The first value.
   * @param b The second value.
   * @param args Additional values.
   */
  function and(a: unknown, b: unknown, ...args: unknown[]): boolean;
  /**
   * Checks if all arguments are equal.
   *
   * @param a The first value to compare.
   * @param b The second value to compare.
   * @param args Additional values to compare.
   */
  function eq(a: unknown, b: unknown, ...args: unknown[]): boolean;
  /**
   * Checks if arguments are strictly decreasing.
   *
   * @param a The first number.
   * @param b The second number.
   * @param args Additional numbers.
   */
  function gt(a: number, b: number, ...args: number[]): boolean;
  /**
   * Checks if arguments are non-increasing.
   *
   * @param a The first number.
   * @param b The second number.
   * @param args Additional numbers.
   */
  function gte(a: number, b: number, ...args: number[]): boolean;
  /**
   * Checks if arguments are strictly increasing.
   *
   * @param a The first number.
   * @param b The second number.
   * @param args Additional numbers.
   */
  function lt(a: number, b: number, ...args: number[]): boolean;
  /**
   * Checks if arguments are non-decreasing.
   *
   * @param a The first number.
   * @param b The second number.
   * @param args Additional numbers.
   */
  function lte(a: number, b: number, ...args: number[]): boolean;
  /**
   * Checks if adjacent arguments are different.
   *
   * @param a The first value to compare.
   * @param b The second value to compare.
   * @param args Additional values to compare.
   */
  function neq(a: unknown, b: unknown, ...args: unknown[]): boolean;
  /**
   * Logical NOT. Returns the opposite boolean value.
   *
   * @param value The boolean value to negate.
   */
  function not(value: unknown): boolean;
  /**
   * Logical OR. Returns true if at least one argument is true.
   *
   * @param a The first value.
   * @param b The second value.
   * @param args Additional values.
   */
  function or(a: unknown, b: unknown, ...args: unknown[]): boolean;
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
  function arg<T>(index: number): T;
  /**
   * Get all arguments
   */
  function args(): any[];
  /**
   * Breaks out of the current loop.
   */
  function break_(): never;
  /**
   * Current caller
   */
  function caller(): Entity;
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
  function if_<T>(condition: unknown, then: unknown, else_?: unknown): T;
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
   * Returns the argument as is, without evaluation. Used for passing arrays as values to opcodes.
   *
   * @param value The value to quote.
   */
  function quote(value: any): any;
  /**
   * Returns from the current function, optionally returning a value.
   *
   * @param value The value to return.
   */
  function return_(value?: any): never;
  /**
   * Sends a system message to the client.
   *
   * @param type The message type.
   * @param payload The message payload.
   */
  function send(type_: string, payload: unknown): null;
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
     * @param y The y coordinate.
     * @param x The x coordinate.
     */
    function atan2(y: number, x: number): number;
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
    function concat(...lists: any[][]): any[];
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
    function filter(list: any[], lambda: unknown): any[];
    /**
     * Returns the first element in the provided list that satisfies the provided testing function.
     *
     * @param list The list to search.
     * @param lambda The testing function.
     */
    function find(list: any[], lambda: unknown): any;
    /**
     * Creates a new list by applying a given callback function to each element of the list, and then flattening the result by one level.
     *
     * @param list The list to map.
     * @param lambda The mapping function.
     */
    function flatMap(list: readonly unknown[], lambda: object): any[];
    /**
     * Retrieves the item at the specified index.
     *
     * @param list The list to access.
     * @param index The index of the item.
     */
    function get(list: any[], index: number): any;
    /**
     * Determines whether a list includes a certain value.
     *
     * @param list The list to check.
     * @param value The value to search for.
     */
    function includes(list: readonly unknown[], value: any): boolean;
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
    function map(list: any[], lambda: unknown): any[];
    /**
     * Creates a new list from the provided arguments.
     *
     * @param items The items to include in the list.
     */
    function new_<T>(...items: unknown[]): T[];
    /**
     * Removes and returns the last item of the list.
     *
     * @param list The list to modify.
     */
    function pop(list: unknown[]): any;
    /**
     * Adds an item to the end of the list.
     *
     * @param list The list to modify.
     * @param value The item to add.
     */
    function push(list: unknown[], value: any): number;
    /**
     * Executes a user-supplied 'reducer' callback function on each element of the list, in order, passing in the return value from the calculation on the preceding element.
     *
     * @param list The list to reduce.
     * @param lambda The reducer function.
     * @param initialValue The initial value.
     */
    function reduce(list: any[], lambda: unknown, initialValue: unknown): any;
    /**
     * Reverses a list in place.
     *
     * @param list The list to reverse.
     */
    function reverse(list: any[]): any[];
    /**
     * Sets the item at the specified index.
     *
     * @param list The list to modify.
     * @param index The index to set.
     * @param value The new value.
     */
    function set(list: any[], index: number, value: unknown): any;
    /**
     * Removes and returns the first item of the list.
     *
     * @param list The list to modify.
     */
    function shift(list: unknown[]): any;
    /**
     * Returns a shallow copy of a portion of the list.
     *
     * @param list The list to slice.
     * @param start The start index.
     * @param end The end index (exclusive).
     */
    function slice(list: any[], start: number, end?: number): any[];
    /**
     * Sorts the elements of a list in place.
     *
     * @param list The list to sort.
     */
    function sort(list: any[]): any[];
    /**
     * Changes the contents of a list by removing or replacing existing elements and/or adding new elements.
     *
     * @param list The list to modify.
     * @param start The start index.
     * @param deleteCount The number of items to remove.
     * @param items The items to add.
     */
    function splice(list: unknown[], start: number, deleteCount: number, ...items: any[]): any[];
    /**
     * Adds an item to the beginning of the list.
     *
     * @param list The list to modify.
     * @param value The item to add.
     */
    function unshift(list: unknown[], value: any): number;
  }
  namespace obj {
    /**
     * Deletes a property from an object.
     *
     * @param object The object to modify.
     * @param key The property key.
     */
    function del<T, K extends keyof T = keyof T>(object: T, key: K): boolean;
    /**
     * Returns an array of a given object's own enumerable string-keyed property [key, value] pairs.
     *
     * @param object The object to get entries from.
     */
    function entries<T>(object: T): readonly [keyof T, T[keyof T]][];
    /**
     * Creates a new object with a subset of properties that pass the test implemented by the provided function.
     *
     * @param object The object to filter.
     * @param lambda The testing function.
     */
    function filter<T>(object: T, lambda: object): Partial<T>;
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
    function get<T, K extends keyof T = keyof T>(object: T, key: K, default_?: T[K]): T[K];
    /**
     * Checks if an object has a specific property.
     *
     * @param object The object to check.
     * @param key The property key.
     */
    function has<T, K extends keyof T = keyof T>(object: T, key: K): boolean;
    /**
     * Returns an array of a given object's own enumerable property names.
     *
     * @param object The object to get keys from.
     */
    function keys<T>(object: T): readonly (keyof T)[];
    /**
     * Creates a new object with the same keys as the original, but with values transformed by a function.
     *
     * @param object The object to map.
     * @param lambda The mapping function.
     */
    function map(object: object, lambda: object): any;
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
      [K in keyof Kvs & `${number}` as (Kvs[K] & [string, unknown])[0]]: (Kvs[K] &
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
    function set<T, K extends keyof T = keyof T>(object: T, key: K, value: T[K]): T;
    /**
     * Returns an array of a given object's own enumerable property values.
     *
     * @param object The object to get values from.
     */
    function values<T>(object: T): readonly T[keyof T][];
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
}

export {};
