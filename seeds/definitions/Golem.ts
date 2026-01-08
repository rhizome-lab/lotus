// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
import { EntityBase } from "./EntityBase";

export class Golem extends EntityBase {
  on_hear() {
    const speaker = std.arg<Entity>(0);
    const message = std.arg<string>(1);
    // oxlint-disable-next-line no-null-coalescing-default
    const msgLower = str.lower(message ?? "");
    if (str.includes(msgLower, "hello")) {
      call(speaker, "tell", "GREETINGS. I AM GOLEM.");
    }
  }
}
