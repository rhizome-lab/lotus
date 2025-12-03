import { defineOpcode } from "../def";

/**
 * Returns the length of a string.
 */
const strLen = defineOpcode<[string], number>("str.len", {
  metadata: {
    label: "Length",
    category: "string",
    description: "Get string length",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string" }],
    returnType: "number",
  },
  handler: ([str], _ctx) => {
    return str.length;
  },
});
export { strLen as "str.len" };

/**
 * Concatenates multiple strings into one.
 */
const strConcat = defineOpcode<(string | number | boolean | null)[], string>("str.concat", {
  metadata: {
    label: "Concat",
    category: "string",
    description: "Concatenate strings",
    slots: [{ name: "Strings", type: "block" }], // Variadic?
    parameters: [{ name: "...strings", type: "any[]" }],
    returnType: "string",
  },
  handler: (args, _ctx) => {
    const strings: string[] = [];
    for (const arg of args) {
      strings.push(String(arg));
    }
    return strings.join("");
  },
});
export { strConcat as "str.concat" };

/**
 * Splits a string into an array of substrings using a separator.
 */
const strSplit = defineOpcode<[string, string], string[]>("str.split", {
  metadata: {
    label: "Split",
    category: "string",
    description: "Split string by separator",
    slots: [
      { name: "String", type: "string" },
      { name: "Separator", type: "string" },
    ],
    parameters: [
      { name: "string", type: "string" },
      { name: "separator", type: "string" },
    ],
    returnType: "string[]",
  },
  handler: ([str, sep], _ctx) => {
    return str.split(sep);
  },
});
export { strSplit as "str.split" };

/**
 * Extracts a section of a string and returns it as a new string.
 */
const strSlice = defineOpcode<[string, number, number?], string>("str.slice", {
  metadata: {
    label: "Slice",
    category: "string",
    description: "Extract part of string",
    slots: [
      { name: "String", type: "string" },
      { name: "Start", type: "number" },
      { name: "End", type: "number", default: null },
    ],
    parameters: [
      { name: "string", type: "string" },
      { name: "start", type: "number" },
      { name: "end", type: "number", optional: true },
    ],
    returnType: "string",
  },
  handler: ([str, start, endExpr], _ctx) => {
    const end = endExpr !== undefined ? endExpr : str.length;
    return str.slice(start, end);
  },
});
export { strSlice as "str.slice" };

/**
 * Converts a string to uppercase.
 */
const strUpper = defineOpcode<[string], string>("str.upper", {
  metadata: {
    label: "To Upper",
    category: "string",
    description: "Convert to uppercase",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string" }],
    returnType: "string",
  },
  handler: ([str], _ctx) => {
    return str.toUpperCase();
  },
});
export { strUpper as "str.upper" };

/**
 * Converts a string to lowercase.
 */
const strLower = defineOpcode<[string], string>("str.lower", {
  metadata: {
    label: "To Lower",
    category: "string",
    description: "Convert to lowercase",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string" }],
    returnType: "string",
  },
  handler: ([str], _ctx) => {
    return str.toLowerCase();
  },
});
export { strLower as "str.lower" };

/**
 * Removes whitespace from both ends of a string.
 */
const strTrim = defineOpcode<[string], string>("str.trim", {
  metadata: {
    label: "Trim",
    category: "string",
    description: "Trim whitespace",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string" }],
    returnType: "string",
  },
  handler: ([str], _ctx) => {
    return str.trim();
  },
});
export { strTrim as "str.trim" };

/**
 * Replaces occurrences of a substring with another string.
 */
const strReplace = defineOpcode<[string, string, string], string>("str.replace", {
  metadata: {
    label: "Replace",
    category: "string",
    description: "Replace substring",
    slots: [
      { name: "String", type: "string" },
      { name: "Search", type: "string" },
      { name: "Replace", type: "string" },
    ],
    parameters: [
      { name: "string", type: "string" },
      { name: "search", type: "string" },
      { name: "replace", type: "string" },
    ],
    returnType: "string",
  },
  handler: ([str, search, replace], _ctx) => {
    return str.replace(search, replace);
  },
});
export { strReplace as "str.replace" };

/**
 * Checks if a string contains another string.
 */
const strIncludes = defineOpcode<[string, string], boolean>("str.includes", {
  metadata: {
    label: "Includes",
    category: "string",
    description: "Check if string includes substring",
    slots: [
      { name: "String", type: "string" },
      { name: "Search", type: "string" },
    ],
    parameters: [
      { name: "string", type: "string" },
      { name: "search", type: "string" },
    ],
    returnType: "boolean",
  },
  handler: ([str, search], _ctx) => {
    return str.includes(search);
  },
});
export { strIncludes as "str.includes" };

/**
 * Joins elements of a list into a string using a separator.
 */
const strJoin = defineOpcode<[any[], string], string>("str.join", {
  metadata: {
    label: "Join",
    category: "string",
    description: "Join list elements with separator",
    slots: [
      { name: "List", type: "block" },
      { name: "Separator", type: "string" },
    ],
    parameters: [
      { name: "list", type: "any[]" },
      { name: "separator", type: "string" },
    ],
    returnType: "string",
  },
  handler: ([list, separator], _ctx) => {
    return list.join(separator);
  },
});
export { strJoin as "str.join" };
