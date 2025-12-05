import { defineFullOpcode } from "../types";

/** Returns the length of a string. */
export const strLen = defineFullOpcode<[string], number>("str.len", {
  metadata: {
    label: "Length",
    category: "string",
    description: "Returns the length of a string.",
    slots: [{ name: "String", type: "string" }],
    parameters: [
      {
        name: "string",
        type: "string",
        description: "The string to measure.",
      },
    ],
    returnType: "number",
  },
  handler: ([str], _ctx) => {
    return str.length;
  },
});

/** Concatenates multiple strings into one. */
export const strConcat = defineFullOpcode<(string | number | boolean | null)[], string>(
  "str.concat",
  {
    metadata: {
      label: "Concat",
      category: "string",
      description: "Concatenates multiple strings into one.",
      slots: [{ name: "Strings", type: "block" }], // Variadic?
      parameters: [
        { name: "...strings", type: "any[]", description: "The strings to concatenate." },
      ],
      returnType: "string",
    },
    handler: (args, _ctx) => {
      const strings: string[] = [];
      for (const arg of args) {
        strings.push(String(arg));
      }
      return strings.join("");
    },
  },
);

/** Splits a string into an array of substrings using a separator. */
export const strSplit = defineFullOpcode<[string, string], string[]>("str.split", {
  metadata: {
    label: "Split",
    category: "string",
    description: "Splits a string into an array of substrings using a separator.",
    slots: [
      { name: "String", type: "string" },
      { name: "Separator", type: "string" },
    ],
    parameters: [
      { name: "string", type: "string", description: "The string to split." },
      {
        name: "separator",
        type: "string",
        optional: false,
        description: "The separator to split by.",
      },
    ],
    returnType: "string[]",
  },
  handler: ([str, sep], _ctx) => {
    return str.split(sep);
  },
});

/** Extracts a section of a string and returns it as a new string. */
export const strSlice = defineFullOpcode<[string, number, number?], string>("str.slice", {
  metadata: {
    label: "Slice",
    category: "string",
    description: "Extracts a section of a string and returns it as a new string.",
    slots: [
      { name: "String", type: "string" },
      { name: "Start", type: "number" },
      { name: "End", type: "number", default: null },
    ],
    parameters: [
      { name: "string", type: "string", description: "The string to slice." },
      { name: "start", type: "number", description: "The start index." },
      { name: "end", type: "number", optional: true, description: "The end index (exclusive)." },
    ],
    returnType: "string",
  },
  handler: ([str, start, endExpr], _ctx) => {
    const end = endExpr !== undefined ? endExpr : str.length;
    return str.slice(start, end);
  },
});

/** Converts a string to uppercase. */
export const strUpper = defineFullOpcode<[string], string>("str.upper", {
  metadata: {
    label: "To Upper Case",
    category: "string",
    description: "Converts a string to uppercase.",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string", description: "The string to convert." }],
    returnType: "string",
  },
  handler: ([str], _ctx) => {
    return str.toUpperCase();
  },
});

/** Converts a string to lowercase. */
export const strLower = defineFullOpcode<[string], string>("str.lower", {
  metadata: {
    label: "To Lower Case",
    category: "string",
    description: "Converts a string to lowercase.",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string", description: "The string to convert." }],
    returnType: "string",
  },
  handler: ([str], _ctx) => {
    return str.toLowerCase();
  },
});

/** Removes whitespace from both ends of a string. */
export const strTrim = defineFullOpcode<[string], string>("str.trim", {
  metadata: {
    label: "Trim",
    category: "string",
    description: "Removes whitespace from both ends of a string.",
    slots: [{ name: "String", type: "string" }],
    parameters: [{ name: "string", type: "string", description: "The string to trim." }],
    returnType: "string",
  },
  handler: ([str], _ctx) => {
    return str.trim();
  },
});

/** Replaces occurrences of a substring with another string. */
export const strReplace = defineFullOpcode<[string, string, string], string>("str.replace", {
  metadata: {
    label: "Replace All",
    category: "string",
    description: "Replaces occurrences of a substring with another string.",
    slots: [
      { name: "String", type: "string" },
      { name: "Search", type: "string" },
      { name: "Replace", type: "string" },
    ],
    parameters: [
      { name: "string", type: "string", description: "The string to search in." },
      { name: "search", type: "string", description: "The string to search for." },
      {
        name: "replace",
        type: "string",
        optional: true,
        description: "The string to replace with.",
      },
    ],
    returnType: "string",
  },
  handler: ([str, search, replace], _ctx) => {
    return str.replace(search, replace);
  },
});

/** Checks if a string contains another string. */
export const strIncludes = defineFullOpcode<[string, string], boolean>("str.includes", {
  metadata: {
    label: "Index Of",
    category: "string",
    description: "Checks if a string contains another string.",
    slots: [
      { name: "String", type: "string" },
      { name: "Search", type: "string" },
    ],
    parameters: [
      { name: "string", type: "string", description: "The string to check." },
      { name: "search", type: "string", description: "The substring to search for." },
    ],
    returnType: "boolean",
  },
  handler: ([str, search], _ctx) => {
    return str.includes(search);
  },
});

/** Joins elements of a list into a string using a separator. */
export const strJoin = defineFullOpcode<[any[], string], string>("str.join", {
  metadata: {
    label: "Join",
    category: "string",
    description: "Joins elements of a list into a string using a separator.",
    slots: [
      { name: "List", type: "block" },
      { name: "Separator", type: "string" },
    ],
    parameters: [
      { name: "list", type: "any[]", description: "The list to join." },
      { name: "separator", type: "string", description: "The separator to use." },
    ],
    returnType: "string",
  },
  handler: ([list, separator], _ctx) => {
    return list.join(separator);
  },
});
