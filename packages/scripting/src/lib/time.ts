import { ScriptError } from "../interpreter";
import { defineOpcode, ScriptValue } from "../def";

/**
 * Returns the current time as an ISO 8601 string.
 */
const timeNow = defineOpcode<[], string>(
  "time.now",
  {
    metadata: {
      label: "Now",
      category: "time",
      description: "Get current time (ISO)",
      slots: [],
      parameters: [],
      returnType: "string",
    },
    handler: (args, _ctx) => {
      if (args.length !== 0) {
        throw new ScriptError("time.now: expected 0 arguments");
      }
      return new Date().toISOString();
    },
  }
);
export { timeNow as "time.now" };

/**
 * Formats a timestamp string.
 */
const timeFormat = defineOpcode<[ScriptValue<string>, ScriptValue<string>?], string>(
  "time.format",
  {
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
        { name: "format", type: "string" },
      ],
      returnType: "string",
    },
    handler: (args, _ctx) => {
      if (args.length < 1 || args.length > 2) {
        throw new ScriptError("time.format: expected 1 or 2 arguments");
      }
      const [timestamp] = args;
      if (typeof timestamp !== "string") {
        throw new ScriptError("time.format: expected string for timestamp");
      }
      return new Date(timestamp).toISOString();
    },
  }
);
export { timeFormat as "time.format" };

/**
 * Parses a datetime string and returns it in ISO 8601 format.
 */
const timeParse = defineOpcode<[ScriptValue<string>], string>(
  "time.parse",
  {
    metadata: {
      label: "Parse Time",
      category: "time",
      description: "Parse datetime string",
      slots: [{ name: "Time", type: "string" }],
      parameters: [{ name: "time", type: "string" }],
      returnType: "string",
    },
    handler: (args, _ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("time.parse: expected 1 argument");
      }
      const [datetime] = args;
      if (typeof datetime !== "string") {
        throw new ScriptError("time.parse: expected string for datetime");
      }
      return new Date(datetime).toISOString();
    },
  }
);
export { timeParse as "time.parse" };

/**
 * Converts a numeric timestamp (ms since epoch) to an ISO 8601 string.
 */
const timeFromTimestamp = defineOpcode<[ScriptValue<number>], string>(
  "time.from_timestamp",
  {
    metadata: {
      label: "From Timestamp",
      category: "time",
      description: "Convert number to ISO",
      slots: [{ name: "Timestamp", type: "number" }],
      parameters: [{ name: "timestamp", type: "number" }],
      returnType: "string",
    },
    handler: (args, _ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("time.from_timestamp: expected 1 argument");
      }
      const [timestamp] = args;
      if (typeof timestamp !== "number") {
        throw new ScriptError(
          "time.from_timestamp: expected number for timestamp",
        );
      }
      return new Date(timestamp).toISOString();
    },
  }
);
export { timeFromTimestamp as "time.from_timestamp" };

/**
 * Converts an ISO 8601 string to a numeric timestamp (ms since epoch).
 */
const timeToTimestamp = defineOpcode<[ScriptValue<string>], number>(
  "time.to_timestamp",
  {
    metadata: {
      label: "To Timestamp",
      category: "time",
      description: "Convert ISO to number",
      slots: [{ name: "Time", type: "string" }],
      parameters: [{ name: "time", type: "string" }],
      returnType: "number",
    },
    handler: (args, _ctx) => {
      if (args.length !== 1) {
        throw new ScriptError("time.to_timestamp: expected 1 argument");
      }
      const [datetime] = args;
      if (typeof datetime !== "string") {
        throw new ScriptError(
          "time.to_timestamp: expected string for datetime",
        );
      }
      return new Date(datetime).getTime();
    },
  }
);
export { timeToTimestamp as "time.to_timestamp" };

/**
 * Adds an offset to a timestamp.
 */
const timeOffset = defineOpcode<[ScriptValue<number>, ScriptValue<"day" | "days" | "hour" | "hours" | "minute" | "minutes" | "month" | "months" | "second" | "seconds" | "year" | "years">, ScriptValue<string>?], string>(
  "time.offset",
  {
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
        { name: "base", type: "string" },
      ],
      returnType: "string",
    },
    handler: (args, _ctx) => {
      if (args.length < 2 || args.length > 3) {
        throw new ScriptError("time.offset: expected 2 or 3 arguments");
      }
      const [amount, unit, baseExpr] = args;
      if (typeof amount !== "number") {
        throw new ScriptError("time.offset: expected number for amount");
      }
      if (typeof unit !== "string") {
        throw new ScriptError("time.offset: expected string for unit");
      }
      const base = baseExpr !== undefined
        ? baseExpr
        : new Date().toISOString();
      if (typeof base !== "string") {
        throw new ScriptError("time.offset: expected string for base");
      }

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
          throw new ScriptError("time.offset: unknown unit");
        }
      }
      return date.toISOString();
    },
  }
);
export { timeOffset as "time.offset" };
