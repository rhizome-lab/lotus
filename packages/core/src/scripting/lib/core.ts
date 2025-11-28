import {
  evaluate,
  evaluateTarget,
  executeLambda,
  ScriptContext,
  ScriptError,
} from "../interpreter";
import { checkPermission } from "../../permissions";
import { Entity, SPECIAL_PROPERTIES, updateEntity } from "../../repo";

export const CoreLibrary: Record<
  string,
  (args: any[], ctx: ScriptContext) => Promise<any>
> = {
  // Control Flow
  seq: async (args, ctx) => {
    let lastResult = null;
    for (const step of args) {
      lastResult = await evaluate(step, ctx);
    }
    return lastResult;
  },
  do: async (args, ctx) => {
    let lastResult = null;
    for (const step of args) {
      lastResult = await evaluate(step, ctx);
    }
    return lastResult;
  },
  if: async (args, ctx) => {
    if (args.length < 2 || args.length > 3) {
      throw new ScriptError("if requires 2 or 3 arguments");
    }
    const [cond, thenBranch, elseBranch] = args;
    if (await evaluate(cond, ctx)) {
      return await evaluate(thenBranch, ctx);
    } else if (elseBranch) {
      return await evaluate(elseBranch, ctx);
    }
    return null;
  },
  while: async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("while requires 2 arguments");
    }
    const [cond, body] = args;
    let result = null;
    while (await evaluate(cond, ctx)) {
      result = await evaluate(body, ctx);
    }
    return result;
  },
  for: async (args, ctx) => {
    if (args.length !== 3) {
      throw new ScriptError("for requires 3 arguments");
    }
    const [varName, listExpr, body] = args;
    const list = await evaluate(listExpr, ctx);
    if (!Array.isArray(list)) return null;

    let lastResult = null;
    for (const item of list) {
      // Set loop variable
      ctx.vars = ctx.vars || {};
      ctx.vars[varName] = item;
      lastResult = await evaluate(body, ctx);
    }
    return lastResult;
  },
  return: async (args, ctx) => {
    return await evaluate(args[0], ctx);
  },
  list: async (args, ctx) => {
    const result = [];
    for (const arg of args) {
      result.push(await evaluate(arg, ctx));
    }
    return result;
  },

  // Variables
  let: async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("let requires 2 arguments");
    }
    const [name, val] = args;
    const value = await evaluate(val, ctx);
    ctx.vars = ctx.vars || {};
    ctx.vars[name] = value;
    return value;
  },
  var: async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("var: expected 1 argument");
    }
    const [name] = args;
    return ctx.vars?.[name] ?? null;
  },
  set: async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("set: expected 2 arguments");
    }
    const [name, val] = args;
    const value = await evaluate(val, ctx);
    if (ctx.vars && name in ctx.vars) {
      ctx.vars[name] = value;
    }
    return value;
  },

  // Comparison
  "==": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("==: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev !== next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
  "!=": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("!=: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev === next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
  "<": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("<: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev >= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
  ">": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError(">: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev <= next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
  "<=": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("<=: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev > next) {
        return false;
      }
      prev = next;
    }
    return true;
  },
  ">=": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError(">=: expected at least 2 arguments");
    }
    let prev = await evaluate(args[0], ctx);
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (prev < next) {
        return false;
      }
      prev = next;
    }
    return true;
  },

  // Arithmetic
  "+": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("+: expected at least 2 arguments");
    }
    let sum = await evaluate(args[0], ctx);
    if (typeof sum !== "number") {
      throw new ScriptError("+: expected a number");
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError("+: expected a number");
      }
      sum += next;
    }
    return sum;
  },
  "-": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("-: expected at least 2 arguments");
    }
    let diff = await evaluate(args[0], ctx);
    if (typeof diff !== "number") {
      throw new ScriptError("-: expected a number");
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError("-: expected a number");
      }
      diff -= next;
    }
    return diff;
  },
  "*": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("*: expected at least 2 arguments");
    }
    let prod = await evaluate(args[0], ctx);
    if (typeof prod !== "number") {
      throw new ScriptError("*: expected a number");
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError("*: expected a number");
      }
      prod *= next;
    }
    return prod;
  },
  "/": async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("/: expected at least 2 arguments");
    }
    let quot = await evaluate(args[0], ctx);
    if (typeof quot !== "number") {
      throw new ScriptError("/: expected a number");
    }
    for (let i = 1; i < args.length; i++) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError("/: expected a number");
      }
      quot /= next;
    }
    return quot;
  },
  "%": async (args, ctx) => {
    if (args.length !== 2) {
      throw new ScriptError("%: expected 2 arguments");
    }
    const aEval = await evaluate(args[0], ctx);
    if (typeof aEval !== "number") {
      throw new ScriptError("%: expected a number");
    }
    const bEval = await evaluate(args[1], ctx);
    if (typeof bEval !== "number") {
      throw new ScriptError("%: expected a number");
    }
    return aEval % bEval;
  },
  "^": async (args, ctx) => {
    // Power tower
    if (args.length < 2) {
      throw new ScriptError("^: expected at least 2 arguments");
    }
    let pow = await evaluate(args[args.length - 1], ctx);
    if (typeof pow !== "number") {
      throw new ScriptError(`^: expected a number at index ${args.length - 1}`);
    }
    for (let i = args.length - 2; i >= 0; i--) {
      const next = await evaluate(args[i], ctx);
      if (typeof next !== "number") {
        throw new ScriptError(`^: expected a number at index ${i}`);
      }
      pow = next ** pow;
    }
    return pow;
  },

  // Logic
  and: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("and: expected at least 2 arguments");
    }
    for (const arg of args) {
      if (!(await evaluate(arg, ctx))) return false;
    }
    return true;
  },
  or: async (args, ctx) => {
    if (args.length < 2) {
      throw new ScriptError("or: expected at least 2 arguments");
    }
    for (const arg of args) {
      if (await evaluate(arg, ctx)) return true;
    }
    return false;
  },
  not: async (args, ctx) => {
    if (args.length !== 1) {
      throw new ScriptError("not: expected 1 argument");
    }
    return !(await evaluate(args[0], ctx));
  },

  // System
  log: async (args, ctx) => {
    if (args.length < 1) {
      throw new ScriptError("log: expected at least 1 argument");
    }
    const messages = [];
    for (const arg of args) {
      messages.push(await evaluate(arg, ctx));
    }
    console.log(...messages);
    return null;
  },
  arg: async (args, ctx) => {
    const [index] = args;
    return ctx.args?.[index] ?? null;
  },
  args: async (_args, ctx) => {
    return ctx.args ?? [];
  },
  random: async (args, ctx) => {
    // random(max), random(min, max) or random() -> 0..1
    if (args.length > 2) {
      throw new ScriptError("random: expected 0, 1, or 2 arguments");
    }
    if (args.length === 0) return Math.random();
    const min = args.length === 2 ? await evaluate(args[0], ctx) : 0;
    const max = await evaluate(args[args.length === 2 ? 1 : 0], ctx);
    const shouldFloor = min % 1 === 0 && max % 1 === 0;
    if (typeof min !== "number") {
      throw new ScriptError("random: min must be a number");
    }
    if (typeof max !== "number") {
      throw new ScriptError("random: max must be a number");
    }
    if (min > max) {
      throw new ScriptError("random: min must be less than or equal to max");
    }
    const roll = Math.random() * (max - min + 1) + min;
    return shouldFloor ? Math.floor(roll) : roll;
  },
  warn: async (args, ctx) => {
    const [msg] = args;
    const text = await evaluate(msg, ctx);
    ctx.warnings.push(String(text));
  },
  throw: async (args, ctx) => {
    const [msg] = args;
    throw new ScriptError(await evaluate(msg, ctx));
  },
  try: async (args, ctx) => {
    const [tryBlock, errorVar, catchBlock] = args;
    try {
      return await evaluate(tryBlock, ctx);
    } catch (e: any) {
      if (catchBlock) {
        if (errorVar && typeof errorVar === "string") {
          if (!ctx.vars) ctx.vars = {};
          ctx.vars[errorVar] = e.message || String(e);
        }
        return await evaluate(catchBlock, ctx);
      }
    }
  },

  // Entity Interaction
  tell: async (args, ctx) => {
    const [targetExpr, msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    const target = await evaluateTarget(targetExpr, ctx);

    if (!target) {
      throw new ScriptError("tell: target not found");
    }

    // If target is caller (resolved), send to socket
    if (target.id === ctx.caller.id) {
      if (ctx.sys?.send) {
        ctx.sys.send({ type: "message", text: msg });
      }
      return true;
    }

    // Otherwise, trigger on_hear and notify caller
    if (ctx.sys?.triggerEvent) {
      // Notify caller
      if (ctx.sys.send) {
        ctx.sys.send({
          type: "message",
          text: `You tell ${target.name}: "${msg}"`,
        });
      }

      // Trigger on_hear
      // We use sys.call if available to target the specific entity
      if (ctx.sys.call) {
        try {
          await ctx.sys.call(
            ctx.caller,
            target.id,
            "on_hear",
            [msg, ctx.caller.id, "tell"],
            ctx.warnings,
          );
        } catch {
          // Ignore if verb not found
        }
      }
    }
    return true;
  },

  move: async (args, ctx) => {
    const [targetExpr, destExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const dest = await evaluateTarget(destExpr, ctx);

    if (!target) {
      throw new ScriptError("move: target not found");
    }
    if (!dest) {
      throw new ScriptError("move: destination not found");
    }

    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(
        `move: permission denied: cannot move ${target.id}`,
      );
    }

    if (ctx.sys?.move) {
      // Check enter permission on destination
      if (!checkPermission(ctx.caller, dest, "enter")) {
        throw new ScriptError(
          `move: permission denied: cannot enter ${dest.id}`,
        );
      }
      ctx.sys.move(target.id, dest.id);
    }
    return true;
  },

  create: async (args, ctx) => {
    if (!ctx.sys) {
      throw new ScriptError("create: no system available");
    }
    if (!ctx.sys.create) {
      throw new ScriptError("create: no create function available");
    }
    if (args.length === 1) {
      const [dataExpr] = args;
      const data = await evaluate(dataExpr, ctx);
      return ctx.sys.create(data);
    } else {
      if (args.length < 2 || args.length > 4) {
        throw new ScriptError("create: expected 2, 3, or 4 arguments");
      }
      const [kindExpr, nameExpr, propsExpr, locExpr] = args;
      const kind = await evaluate(kindExpr, ctx);
      const name = await evaluate(nameExpr, ctx);
      const props = propsExpr ? await evaluate(propsExpr, ctx) : {};
      const location_id = locExpr ? await evaluate(locExpr, ctx) : undefined;
      return ctx.sys.create({ kind, name, props, location_id });
    }
  },

  destroy: async (args, ctx) => {
    const [targetExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    if (!target) {
      throw new ScriptError("destroy: target not found");
    }
    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(
        `destroy: permission denied: cannot destroy ${target.id}`,
      );
    }
    ctx.sys?.destroy?.(target.id);
  },

  give: async (args, ctx) => {
    const [targetExpr, destExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const dest = await evaluateTarget(destExpr, ctx);

    if (!target) {
      throw new ScriptError("give: target not found");
    }
    if (!dest) {
      throw new ScriptError("give: destination not found");
    }

    // Check permission: caller must own target
    if (target.owner_id !== ctx.caller.id) {
      throw new ScriptError(
        `give: permission denied: you do not own ${target.id}`,
      );
    }

    if (ctx.sys?.give) {
      // Transfer ownership to destination's owner
      // If destination has no owner, check if destination is an ACTOR.
      // If ACTOR, they become owner. If not, clear owner (public).
      let newOwnerId = dest.owner_id;
      if (!newOwnerId) {
        if (dest.kind === "ACTOR") {
          newOwnerId = dest.id;
        } else {
          newOwnerId = 0; // No owner
        }
      }
      ctx.sys.give(target.id, dest.id, newOwnerId);
    }
  },

  // Properties
  prop: async (args, ctx) => {
    const [targetExpr, keyExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const key = await evaluate(keyExpr, ctx);

    if (!target) {
      throw new ScriptError("prop: target not found");
    }
    if (typeof key !== "string") {
      throw new ScriptError("prop: key must be a string");
    }

    // Check permission
    if (!checkPermission(ctx.caller, target, "view")) {
      throw new ScriptError(
        `prop: permission denied: cannot view ${target.id}`,
      );
    }

    return SPECIAL_PROPERTIES.has(key)
      ? target[key as keyof Entity]
      : target.props[key];
  },

  "prop.set": async (args, ctx) => {
    const [targetExpr, keyExpr, valExpr] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const key = await evaluate(keyExpr, ctx);
    const val = await evaluate(valExpr, ctx);

    if (!target) {
      throw new ScriptError("prop.set: target not found");
    }
    if (typeof key !== "string") {
      throw new ScriptError("prop.set: key must be a string");
    }

    // Check permission
    if (!checkPermission(ctx.caller, target, "edit")) {
      throw new ScriptError(
        `prop.set: permission denied: cannot edit ${target.id}`,
      );
    }

    const newProps = { ...target.props, [key]: val };
    updateEntity(target.id, { props: newProps });
    return val;
  },

  lambda: async (args, ctx) => {
    const [argNames, body] = args;
    return {
      type: "lambda",
      args: argNames,
      body,
      closure: { ...ctx.vars },
    };
  },
  apply: async (args, ctx) => {
    const [funcExpr, ...argExprs] = args;
    const func = await evaluate(funcExpr, ctx);

    if (!func) {
      throw new ScriptError("apply: func not found");
    }
    if (func.type !== "lambda") {
      throw new ScriptError("apply: func must be a lambda");
    }

    const evaluatedArgs = [];
    for (const arg of argExprs) {
      evaluatedArgs.push(await evaluate(arg, ctx));
    }

    // Create new context
    const newVars = { ...func.closure };
    // Bind arguments
    for (let i = 0; i < func.args.length; i++) {
      newVars[func.args[i]] = evaluatedArgs[i];
    }

    return await evaluate(func.body, {
      ...ctx,
      vars: newVars,
    });
  },
  call: async (args, ctx) => {
    const [targetExpr, verbExpr, ...callArgs] = args;
    const target = await evaluateTarget(targetExpr, ctx);
    const verb = await evaluate(verbExpr, ctx);

    // Evaluate arguments
    const evaluatedArgs = [];
    for (const arg of callArgs) {
      evaluatedArgs.push(await evaluate(arg, ctx));
    }

    if (!target) {
      throw new ScriptError("call: target not found");
    }
    if (typeof verb !== "string") {
      throw new ScriptError("call: verb must be a string");
    }

    if (ctx.sys?.call) {
      return await ctx.sys.call(
        ctx.caller,
        target.id,
        verb,
        evaluatedArgs,
        ctx.warnings,
      );
    }
    return null;
  },
  schedule: async (args, ctx) => {
    const [verbExpr, argsExpr, delayExpr] = args;
    const verb = await evaluate(verbExpr, ctx);
    const callArgs = await evaluate(argsExpr, ctx);
    const delay = await evaluate(delayExpr, ctx);

    if (
      typeof verb !== "string" ||
      !Array.isArray(callArgs) ||
      typeof delay !== "number"
    ) {
      throw new ScriptError(
        "schedule: verb must be a string, args must be an array, delay must be a number",
      );
    }

    ctx.sys?.schedule?.(ctx.this.id, verb, callArgs, delay);
  },
  broadcast: async (args, ctx) => {
    const [msgExpr, locExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    const loc = locExpr ? await evaluate(locExpr, ctx) : undefined;
    if (typeof msg !== "string") {
      throw new ScriptError(
        `broadcast: message must be a string, got ${JSON.stringify(msg)}`,
      );
    }
    ctx.sys?.broadcast?.(msg, loc);
  },
  // TODO: Remove `sys.send_room` and `sys.sendRoom`
  "sys.send_room": async (args, ctx) => {
    const [roomIdExpr] = args;
    const roomId = roomIdExpr
      ? await evaluate(roomIdExpr, ctx)
      : ctx.caller.location_id;
    if (typeof roomId !== "number") {
      throw new ScriptError(
        `sys.send_room: room ID must be a number, got ${JSON.stringify(
          roomId,
        )}`,
      );
    }
    ctx.sys?.sendRoom?.(roomId);
  },
  "sys.send": async (args, ctx) => {
    const [msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    ctx.sys?.send?.(msg);
  },
  "world.find": async (args, ctx) => {
    const [nameExpr] = args;
    const name = await evaluate(nameExpr, ctx);
    if (typeof name !== "string") {
      throw new ScriptError(
        `world.find: name must be a string, got ${JSON.stringify(name)}`,
      );
    }
    // evaluateTarget handles "me", "here", and name lookup in room/inventory
    const target = await evaluateTarget(name, ctx);
    return target ? target.id : null;
  },
  "sys.can_edit": async (args, ctx) => {
    const [entityIdExpr] = args;
    const entityId = await evaluate(entityIdExpr, ctx);
    if (typeof entityId !== "number") {
      throw new ScriptError(
        `sys.can_edit: entity ID must be a number, got ${JSON.stringify(
          entityId,
        )}`,
      );
    }
    return ctx.sys?.canEdit?.(ctx.caller.id, entityId) ?? false;
  },
  print: async (args, ctx) => {
    const [msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);
    if (typeof msg !== "string") {
      throw new ScriptError("print: message must be a string");
    }
    ctx.sys?.send?.({ type: "message", text: msg });
  },
  say: async (args, ctx) => {
    const [msgExpr] = args;
    const msg = await evaluate(msgExpr, ctx);

    if (typeof msg !== "string") {
      throw new ScriptError("say: message must be a string");
    }

    ctx.sys?.broadcast?.(
      `${ctx.caller.name} says: "${msg}"`,
      ctx.caller.location_id || undefined,
    );

    if (ctx.caller.location_id) {
      await ctx.sys?.triggerEvent?.(
        "on_hear",
        ctx.caller.location_id,
        [msg, ctx.caller.id, "say"],
        ctx.caller.id, // Exclude speaker
      );
    }
    return;
  },
  // Data Structures
  object: async (args, ctx) => {
    // args: [key1, val1, key2, val2, ...]
    const obj: Record<string, any> = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = await evaluate(args[i], ctx);
      const val = await evaluate(args[i + 1], ctx);
      if (typeof key === "string") {
        obj[key] = val;
      }
    }
    return obj;
  },
  map: async (args, ctx) => {
    const [listExpr, funcExpr] = args;
    const list = await evaluate(listExpr, ctx);
    const func = await evaluate(funcExpr, ctx);

    if (!Array.isArray(list) || !func || func.type !== "lambda") return [];

    const result = [];
    for (const item of list) {
      // Execute lambda for each item
      const res = await executeLambda(func, [item], ctx);
      result.push(res);
    }
    return result;
  },

  // Entity Introspection
  contents: async (args, ctx) => {
    if (!ctx.sys) {
      throw new ScriptError("contents: no system available");
    }
    if (!ctx.sys.getContents) {
      throw new ScriptError("contents: no getContents function available");
    }
    const [containerExpr] = args;
    const container = await evaluateTarget(containerExpr, ctx);
    if (!container) return [];
    return ctx.sys.getContents(container.id);
  },
  verbs: async (args, ctx) => {
    if (!ctx.sys) {
      throw new ScriptError("verbs: no system available");
    }
    if (!ctx.sys.getVerbs) {
      throw new ScriptError("verbs: no getVerbs function available");
    }
    const [entityExpr] = args;
    const entity = await evaluateTarget(entityExpr, ctx);
    if (!entity) return [];
    return ctx.sys.getVerbs(entity.id);
  },
  entity: async (args, ctx) => {
    if (!ctx.sys) {
      throw new ScriptError("entity: no system available");
    }
    if (!ctx.sys.getEntity) {
      throw new ScriptError("entity: no getEntity function available");
    }
    const [idExpr] = args;
    const id = await evaluate(idExpr, ctx);
    if (typeof id !== "number") {
      throw new ScriptError(
        `entity: expected number, got ${JSON.stringify(id)}`,
      );
    }
    const entity = await ctx.sys.getEntity(id);
    if (!entity) {
      throw new ScriptError(`entity: entity ${id} not found`);
    }
    return entity;
  },
  resolve_props: async (args, ctx) => {
    const [entityExpr] = args;
    const entity = await evaluateTarget(entityExpr, ctx);
    if (!entity) {
      throw new ScriptError("resolve_props: entity not found");
    }

    // We need to clone the props so we don't mutate the actual entity in the repo
    const props = { ...entity.props };

    if (ctx.sys?.getVerbs) {
      const verbs = await ctx.sys.getVerbs(entity.id);
      for (const verb of verbs) {
        if (verb.name.startsWith("get_")) {
          const propName = verb.name.substring(4); // remove "get_"
          try {
            const result = await evaluate(verb.code, {
              caller: entity, // The entity itself is the caller for its own getter?
              this: entity,
              args: [],
              gas: 500, // Reduced gas for properties
              sys: ctx.sys,
              warnings: ctx.warnings,
            });

            if (result !== undefined && result !== null) {
              props[propName] = result;
            }
          } catch (e) {
            // Ignore errors in getters for now, or warn
            if (ctx.warnings) {
              ctx.warnings.push(
                `Error resolving property ${propName} for ${entity.id}: ${e}`,
              );
            }
          }
        }
      }
    }

    return { ...entity, props };
  },
  "json.stringify": async (args, ctx) => {
    const [valExpr] = args;
    const val = await evaluate(valExpr, ctx);
    try {
      return JSON.stringify(val);
    } catch {
      return null;
    }
  },
  "json.parse": async (args, ctx) => {
    const [strExpr] = args;
    const str = await evaluate(strExpr, ctx);
    if (typeof str !== "string") return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
};
