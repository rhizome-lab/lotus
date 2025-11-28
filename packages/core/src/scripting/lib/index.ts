import { registerLibrary } from "../interpreter";
import { StringLibrary } from "./string";
import { ListLibrary } from "./list";
import { ObjectLibrary } from "./object";

export function registerStandardLibraries() {
  registerLibrary(StringLibrary);
  registerLibrary(ListLibrary);
  registerLibrary(ObjectLibrary);
}
