import { registerStringLibrary } from "./string";
import { registerListLibrary } from "./list";
import { registerObjectLibrary } from "./object";

export function registerStandardLibraries() {
  registerStringLibrary();
  registerListLibrary();
  registerObjectLibrary();
}
