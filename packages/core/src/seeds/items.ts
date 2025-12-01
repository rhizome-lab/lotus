import { createEntity, addVerb } from "../repo";
import * as Core from "../scripting/lib/core";
import * as String from "../scripting/lib/string";
import * as Object from "../scripting/lib/object";
import * as List from "../scripting/lib/list";

export function seedItems(locationId: number) {
  // 6. Book Item
  const bookId = createEntity({
    name: "Dusty Book",
    location: locationId,
    description: "A dusty old book. It seems to have many chapters.",
    chapters: [
      { title: "Introduction", content: "Welcome to the world of Viwo." },
      { title: "Chapter 1", content: "The beginning of the journey." },
    ],
  });

  addVerb(
    bookId,
    "read",
    Core["seq"](
      Core["let"]("index", Core["arg"](0)),
      Core["if"](
        Core["not"](Core["var"]("index")),
        Core["throw"]("Please specify a chapter index (0-based)."),
      ),
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),
      Core["let"](
        "chapter",
        List["list.get"](Core["var"]("chapters"), Core["var"]("index")),
      ),
      Core["if"](
        Core["not"](Core["var"]("chapter")),
        Core["throw"]("Chapter not found."),
      ),
      Core["call"](
        Core["caller"](),
        "tell",
        String["str.concat"](
          "Reading: ",
          Object["obj.get"](Core["var"]("chapter"), "title"),
          "\n\n",
          Object["obj.get"](Core["var"]("chapter"), "content"),
        ),
      ),
    ),
  );

  addVerb(
    bookId,
    "list_chapters",
    Core["seq"](
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),
      Core["call"](
        Core["caller"](),
        "tell",
        String["str.concat"](
          "Chapters:\n",
          String["str.join"](
            List["list.map"](
              Core["var"]("chapters"),
              Core["lambda"](
                ["c"],
                Object["obj.get"](Core["var"]("c"), "title"),
              ),
            ),
            "\n",
          ),
        ),
      ),
    ),
  );

  addVerb(
    bookId,
    "add_chapter",
    Core["seq"](
      Core["let"]("title", Core["arg"](0)),
      Core["let"]("content", Core["arg"](1)),
      Core["if"](
        Core["not"](Core["and"](Core["var"]("title"), Core["var"]("content"))),
        Core["throw"]("Usage: add_chapter <title> <content>"),
      ),
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),

      // Construct new chapter object
      Core["let"]("newChapter", {}),
      Object["obj.set"](
        Core["var"]("newChapter"),
        "title",
        Core["var"]("title"),
      ),
      Object["obj.set"](
        Core["var"]("newChapter"),
        "content",
        Core["var"]("content"),
      ),

      List["list.push"](Core["var"]("chapters"), Core["var"]("newChapter")),
      Object["obj.set"](Core["this"](), "chapters", Core["var"]("chapters")), // Save back to entity
      Core["call"](Core["caller"](), "tell", "Chapter added."),
    ),
  );

  addVerb(
    bookId,
    "search_chapters",
    Core["seq"](
      Core["let"]("query", String["str.lower"](Core["arg"](0))),
      Core["let"]("chapters", Object["obj.get"](Core["this"](), "chapters")),
      Core["let"](
        "results",
        List["list.filter"](
          Core["var"]("chapters"),
          Core["lambda"](
            ["c"],
            Core["or"](
              String["str.includes"](
                String["str.lower"](
                  Object["obj.get"](Core["var"]("c"), "title"),
                ),
                Core["var"]("query"),
              ),
              String["str.includes"](
                String["str.lower"](
                  Object["obj.get"](Core["var"]("c"), "title"),
                ),
                Core["var"]("query"),
              ),
              String["str.includes"](
                String["str.lower"](
                  Object["obj.get"](Core["var"]("c"), "content"),
                ),
                Core["var"]("query"),
              ),
            ),
          ),
        ),
      ),
      Core["call"](
        Core["caller"](),
        "tell",
        String["str.concat"](
          "Found ",
          List["list.len"](Core["var"]("results")),
          " matches:\n",
          String["str.join"](
            List["list.map"](
              Core["var"]("results"),
              Core["lambda"](
                ["c"],
                Object["obj.get"](Core["var"]("c"), "title"),
              ),
            ),
            "\n",
          ),
        ),
      ),
    ),
  );
}
