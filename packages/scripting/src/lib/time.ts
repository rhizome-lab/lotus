import { defineFullOpcode } from "../types";

/** Returns the current time as an ISO 8601 string. */
export const timeNow = defineFullOpcode<[], string>("time.now", {
  metadata: {
    label: "Now",
    category: "time",
    description: "Returns the current time as an ISO 8601 string.",
    slots: [],
    parameters: [],
    returnType: "string",
  },
  handler: (_args, _ctx) => {
    return new Date().toISOString();
  },
});

/** Formats a timestamp string. */
export const timeFormat = defineFullOpcode<[string, string?], string>("time.format", {
  metadata: {
    label: "Format Time",
    category: "time",
    description: "Formats a timestamp string.",
    slots: [
      { name: "Time", type: "string" },
      { name: "Format", type: "string", default: null }, // Format string not really used yet?
    ],
    parameters: [
      { name: "time", type: "string", description: "The timestamp to format." },
      {
        name: "format",
        type: "string",
        optional: true,
        description: "The format string (currently unused).",
      },
    ],
    returnType: "string",
  },
  handler: ([timestamp], _ctx) => {
    return new Date(timestamp).toISOString();
  },
});

/** Parses a datetime string and returns it in ISO 8601 format. */
export const timeParse = defineFullOpcode<[string], string>("time.parse", {
  metadata: {
    label: "Add Time",
    category: "time",
    description: "Parses a datetime string and returns it in ISO 8601 format.",
    slots: [{ name: "Time", type: "string" }],
    parameters: [
      {
        name: "time",
        type: "string",
        optional: false,
        description: "The datetime string to parse.",
      },
    ],
    returnType: "string",
  },
  handler: ([datetime], _ctx) => {
    return new Date(datetime).toISOString();
  },
});

/** Converts a numeric timestamp (ms since epoch) to an ISO 8601 string. */
export const timeFromTimestamp = defineFullOpcode<[number], string>("time.from_timestamp", {
  metadata: {
    label: "From Timestamp",
    category: "time",
    description: "Converts a numeric timestamp (ms since epoch) to an ISO 8601 string.",
    slots: [{ name: "Timestamp", type: "number" }],
    parameters: [
      {
        name: "timestamp",
        type: "number",
        optional: false,
        description: "The timestamp in milliseconds.",
      },
    ],
    returnType: "string",
  },
  handler: ([timestamp], _ctx) => {
    return new Date(timestamp).toISOString();
  },
});

/** Converts an ISO 8601 string to a numeric timestamp (ms since epoch). */
export const timeToTimestamp = defineFullOpcode<[string], number>("time.to_timestamp", {
  metadata: {
    label: "Time Difference",
    category: "time",
    description: "Converts an ISO 8601 string to a numeric timestamp (ms since epoch).",
    slots: [{ name: "Time", type: "string" }],
    parameters: [{ name: "time", type: "string", description: "The ISO 8601 string." }],
    returnType: "number",
  },
  handler: ([datetime], _ctx) => {
    return new Date(datetime).getTime();
  },
});

/** Adds an offset to a timestamp. */
export const timeOffset = defineFullOpcode<
  [
    number,
    (
      | "day"
      | "days"
      | "hour"
      | "hours"
      | "minute"
      | "minutes"
      | "month"
      | "months"
      | "second"
      | "seconds"
      | "year"
      | "years"
    ),
    string?,
  ],
  string
>("time.offset", {
  metadata: {
    label: "Offset Time",
    category: "time",
    description: "Adds an offset to a timestamp.",
    slots: [
      { name: "Amount", type: "number" },
      { name: "Unit", type: "string" },
      { name: "Base", type: "string", default: null },
    ],
    parameters: [
      { name: "amount", type: "number", description: "The amount to add." },
      {
        name: "unit",
        type: "string",
        optional: false,
        description: "The unit of time (e.g., 'days', 'hours').",
      },
      {
        name: "base",
        type: "string",
        optional: true,
        description: "The base timestamp (defaults to now).",
      },
    ],
    returnType: "string",
  },
  handler: ([amount, unit, baseExpr], _ctx) => {
    const base = baseExpr !== undefined ? baseExpr : new Date().toISOString();

    const date = new Date(base);
    switch (unit) {
      case "year":
      case "years": {
        date.setFullYear(date.getFullYear() + amount);
        break;
      }
      case "month":
      case "months": {
        date.setMonth(date.getMonth() + amount);
        break;
      }
      case "day":
      case "days": {
        date.setDate(date.getDate() + amount);
        break;
      }
      case "hour":
      case "hours": {
        date.setHours(date.getHours() + amount);
        break;
      }
      case "minute":
      case "minutes": {
        date.setMinutes(date.getMinutes() + amount);
        break;
      }
      case "second":
      case "seconds": {
        date.setSeconds(date.getSeconds() + amount);
        break;
      }
      default: {
        // This might still be needed if the type check is only "string" and not the specific enum
        throw new Error("time.offset: unknown unit");
      }
    }
    return date.toISOString();
  },
});
