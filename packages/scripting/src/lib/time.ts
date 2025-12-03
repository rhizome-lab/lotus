import { defineOpcode } from "../def";

/**
 * Returns the current time as an ISO 8601 string.
 */
const timeNow = defineOpcode<[], string>("time.now", {
  metadata: {
    label: "Now",
    category: "time",
    description: "Get current time (ISO)",
    slots: [],
    parameters: [],
    returnType: "string",
  },
  handler: (_args, _ctx) => {
    return new Date().toISOString();
  },
});
export { timeNow as "time.now" };

/**
 * Formats a timestamp string.
 */
const timeFormat = defineOpcode<[string, string?], string>("time.format", {
  metadata: {
    label: "Format Time",
    category: "time",
    description: "Format timestamp",
    slots: [
      { name: "Time", type: "string" },
      { name: "Format", type: "string", default: null }, // Format string not really used yet?
    ],
    parameters: [
      { name: "time", type: "string" },
      { name: "format", type: "string", optional: true },
    ],
    returnType: "string",
  },
  handler: ([timestamp], _ctx) => {
    return new Date(timestamp).toISOString();
  },
});
export { timeFormat as "time.format" };

/**
 * Parses a datetime string and returns it in ISO 8601 format.
 */
const timeParse = defineOpcode<[string], string>("time.parse", {
  metadata: {
    label: "Parse Time",
    category: "time",
    description: "Parse datetime string",
    slots: [{ name: "Time", type: "string" }],
    parameters: [{ name: "time", type: "string" }],
    returnType: "string",
  },
  handler: ([datetime], _ctx) => {
    return new Date(datetime).toISOString();
  },
});
export { timeParse as "time.parse" };

/**
 * Converts a numeric timestamp (ms since epoch) to an ISO 8601 string.
 */
const timeFromTimestamp = defineOpcode<[number], string>("time.from_timestamp", {
  metadata: {
    label: "From Timestamp",
    category: "time",
    description: "Convert number to ISO",
    slots: [{ name: "Timestamp", type: "number" }],
    parameters: [{ name: "timestamp", type: "number" }],
    returnType: "string",
  },
  handler: ([timestamp], _ctx) => {
    return new Date(timestamp).toISOString();
  },
});
export { timeFromTimestamp as "time.from_timestamp" };

/**
 * Converts an ISO 8601 string to a numeric timestamp (ms since epoch).
 */
const timeToTimestamp = defineOpcode<[string], number>("time.to_timestamp", {
  metadata: {
    label: "To Timestamp",
    category: "time",
    description: "Convert ISO to number",
    slots: [{ name: "Time", type: "string" }],
    parameters: [{ name: "time", type: "string" }],
    returnType: "number",
  },
  handler: ([datetime], _ctx) => {
    return new Date(datetime).getTime();
  },
});
export { timeToTimestamp as "time.to_timestamp" };

/**
 * Adds an offset to a timestamp.
 */
const timeOffset = defineOpcode<
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
    description: "Add offset to time",
    slots: [
      { name: "Amount", type: "number" },
      { name: "Unit", type: "string" },
      { name: "Base", type: "string", default: null },
    ],
    parameters: [
      { name: "amount", type: "number" },
      { name: "unit", type: "string" },
      { name: "base", type: "string", optional: true },
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
export { timeOffset as "time.offset" };
