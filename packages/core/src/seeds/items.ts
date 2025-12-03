import { createEntity, addVerb } from "../repo";
import {
  StdLib as Std,
  StringLib as String,
  ObjectLib as Object,
  ListLib as List,
  BooleanLib as Boolean,
} from "@viwo/scripting";
import * as CoreLib from "../runtime/lib/core";

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
    Std["seq"](
      Std["let"]("index", Std["arg"](0)),
      Std["if"](
        Boolean["not"](Std["var"]("index")),
        Std["throw"]("Please specify a chapter index (0-based)."),
      ),
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),
      Std["let"]("chapter", List["list.get"](Std["var"]("chapters"), Std["var"]("index"))),
      Std["if"](Boolean["not"](Std["var"]("chapter")), Std["throw"]("Chapter not found.")),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        String["str.concat"](
          "Reading: ",
          Object["obj.get"](Std["var"]("chapter"), "title"),
          "\n\n",
          Object["obj.get"](Std["var"]("chapter"), "content"),
        ),
      ),
    ),
  );

  addVerb(
    bookId,
    "list_chapters",
    Std["seq"](
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        String["str.concat"](
          "Chapters:\n",
          String["str.join"](
            List["list.map"](
              Std["var"]("chapters"),
              Std["lambda"](["c"], Object["obj.get"](Std["var"]("c"), "title")),
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
    Std["seq"](
      Std["let"]("title", Std["arg"](0)),
      Std["let"]("content", Std["arg"](1)),
      Std["if"](
        Boolean["not"](Boolean["and"](Std["var"]("title"), Std["var"]("content"))),
        Std["throw"]("Usage: add_chapter <title> <content>"),
      ),
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),

      // Construct new chapter object
      Std["let"]("newChapter", {}),
      Object["obj.set"](Std["var"]("newChapter"), "title", Std["var"]("title")),
      Object["obj.set"](Std["var"]("newChapter"), "content", Std["var"]("content")),

      List["list.push"](Std["var"]("chapters"), Std["var"]("newChapter")),
      Object["obj.set"](Std["this"](), "chapters", Std["var"]("chapters")), // Save back to entity
      CoreLib["call"](Std["caller"](), "tell", "Chapter added."),
    ),
  );

  addVerb(
    bookId,
    "search_chapters",
    Std["seq"](
      Std["let"]("query", String["str.lower"](Std["arg"](0))),
      Std["let"]("chapters", Object["obj.get"](Std["this"](), "chapters")),
      Std["let"](
        "results",
        List["list.filter"](
          Std["var"]("chapters"),
          Std["lambda"](
            ["c"],
            Boolean["or"](
              String["str.includes"](
                String["str.lower"](Object["obj.get"](Std["var"]("c"), "title")),
                Std["var"]("query"),
              ),
              String["str.includes"](
                String["str.lower"](Object["obj.get"](Std["var"]("c"), "title")),
                Std["var"]("query"),
              ),
              String["str.includes"](
                String["str.lower"](Object["obj.get"](Std["var"]("c"), "content")),
                Std["var"]("query"),
              ),
            ),
          ),
        ),
      ),
      CoreLib["call"](
        Std["caller"](),
        "tell",
        String["str.concat"](
          "Found ",
          List["list.len"](Std["var"]("results")),
          " matches:\n",
          String["str.join"](
            List["list.map"](
              Std["var"]("results"),
              Std["lambda"](["c"], Object["obj.get"](Std["var"]("c"), "title")),
            ),
            "\n",
          ),
        ),
      ),
    ),
  );
}
