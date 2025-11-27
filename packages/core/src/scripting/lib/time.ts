import { ScriptContext, evaluate } from "../interpreter";

export const TimeLibrary = {
  "time.now": async (_args: any[], _ctx: ScriptContext) => {
    return new Date().toISOString();
  },
  "time.timestamp": async (_args: any[], _ctx: ScriptContext) => {
    return Date.now();
  },
  "time.format": async (args: any[], ctx: ScriptContext) => {
    const [dateExpr, formatExpr] = args;
    const dateStr = await evaluate(dateExpr, ctx);
    const format = await evaluate(formatExpr, ctx);

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Invalid Date";

    // Simple formatter
    if (format === "time") {
      return date.toLocaleTimeString();
    } else if (format === "date") {
      return date.toLocaleDateString();
    }

    return date.toLocaleString();
  },
  "time.offset": async (args: any[], ctx: ScriptContext) => {
    const [amountExpr, unitExpr, dateExpr] = args;
    const amount = await evaluate(amountExpr, ctx);
    const unit = await evaluate(unitExpr, ctx);
    let date = new Date();

    if (dateExpr) {
      const d = await evaluate(dateExpr, ctx);
      if (d) date = new Date(d);
    }

    if (typeof amount !== "number") return date.toISOString();

    switch (unit) {
      case "years":
      case "year":
        date.setFullYear(date.getFullYear() + amount);
        break;
      case "months":
      case "month":
        date.setMonth(date.getMonth() + amount);
        break;
      case "days":
      case "day":
        date.setDate(date.getDate() + amount);
        break;
      case "hours":
      case "hour":
        date.setHours(date.getHours() + amount);
        break;
      case "minutes":
      case "minute":
        date.setMinutes(date.getMinutes() + amount);
        break;
      case "seconds":
      case "second":
        date.setSeconds(date.getSeconds() + amount);
        break;
    }
    return date.toISOString();
  },
};
