import { evaluate, ScriptError, ScriptLibraryDefinition } from "../interpreter";

export const TimeLibrary: ScriptLibraryDefinition = {
  "time.now": async (args, _ctx) => {
    if (args.length !== 0) {
      throw new ScriptError("time.now: expected 0 arguments");
    }
    return new Date().toISOString();
  },
  "time.format": async (args, ctx) => {
    if (args.length < 1 || args.length > 2) {
      throw new ScriptError("time.format: expected 1 or 2 arguments");
    }
    const [timestampExpr] = args;
    const timestamp = await evaluate(timestampExpr, ctx);
    if (typeof timestamp !== "string") {
      throw new ScriptError("time.format: expected string for timestamp");
    }
    return new Date(timestamp).toISOString();
  },
  "time.parse": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("time.parse: expected 1 argument");
    }
    const [datetimeExpr] = args;
    const datetime = await evaluate(datetimeExpr, ctx);
    if (typeof datetime !== "string") {
      throw new ScriptError("time.parse: expected string for datetime");
    }
    return new Date(datetime).toISOString();
  },
  "time.from_timestamp": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("time.from_timestamp: expected 1 argument");
    }
    const [timestampExpr] = args;
    const timestamp = await evaluate(timestampExpr, ctx);
    if (typeof timestamp !== "number") {
      throw new ScriptError(
        "time.from_timestamp: expected number for timestamp",
      );
    }
    return new Date(timestamp).toISOString();
  },
  "time.to_timestamp": async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("time.to_timestamp: expected 1 argument");
    }
    const [datetimeExpr] = args;
    const datetime = await evaluate(datetimeExpr, ctx);
    if (typeof datetime !== "string") {
      throw new ScriptError("time.to_timestamp: expected string for datetime");
    }
    return new Date(datetime).getTime();
  },
  "time.offset": async (args, ctx) => {
    if (args.length < 2 || args.length > 3) {
      throw new ScriptError("time.offset: expected 2 or 3 arguments");
    }
    const [amountExpr, unitExpr, baseExpr] = args;
    const amount = await evaluate(amountExpr, ctx);
    if (typeof amount !== "number") {
      throw new ScriptError("time.offset: expected number for amount");
    }
    const unit = await evaluate(unitExpr, ctx);
    if (typeof unit !== "string") {
      throw new ScriptError("time.offset: expected string for unit");
    }
    const base = baseExpr
      ? await evaluate(baseExpr, ctx)
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
};
