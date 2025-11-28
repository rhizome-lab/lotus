import { createEntity, addVerb } from "../repo";

export function seedItems(locationId: number) {
  // 6. Book Item
  const bookId = createEntity({
    name: "Dusty Book",
    kind: "ITEM",
    location_id: locationId,
    props: {
      description: "A dusty old book. It seems to have many chapters.",
      chapters: [
        { title: "Introduction", content: "Welcome to the world of Viwo." },
        { title: "Chapter 1", content: "The beginning of the journey." },
      ],
    },
  });

  addVerb(bookId, "read", [
    "seq",
    ["let", "index", ["arg", 0]],
    [
      "if",
      ["not", ["var", "index"]],
      ["throw", "Please specify a chapter index (0-based)."],
    ],
    ["let", "chapters", ["prop", "this", "chapters"]],
    ["let", "chapter", ["list.get", ["var", "chapters"], ["var", "index"]]],
    ["if", ["not", ["var", "chapter"]], ["throw", "Chapter not found."]],
    [
      "tell",
      "me",
      [
        "str.concat",
        "Reading: ",
        ["obj.get", ["var", "chapter"], "title"],
        "\n\n",
        ["obj.get", ["var", "chapter"], "content"],
      ],
    ],
  ]);

  addVerb(bookId, "list_chapters", [
    "seq",
    ["let", "chapters", ["prop", "this", "chapters"]],
    [
      "tell",
      "me",
      [
        "str.concat",
        "Chapters:\n",
        [
          "str.join",
          [
            "list.map",
            ["var", "chapters"],
            ["lambda", ["c"], ["obj.get", ["var", "c"], "title"]],
          ],
          "\n",
        ],
      ],
    ],
  ]);

  addVerb(bookId, "add_chapter", [
    "seq",
    ["let", "title", ["arg", 0]],
    ["let", "content", ["arg", 1]],
    [
      "if",
      ["not", ["and", ["var", "title"], ["var", "content"]]],
      ["throw", "Usage: add_chapter <title> <content>"],
    ],
    ["let", "chapters", ["prop", "this", "chapters"]],

    // Construct new chapter object
    ["let", "newChapter", {}],
    ["obj.set", ["var", "newChapter"], "title", ["var", "title"]],
    ["obj.set", ["var", "newChapter"], "content", ["var", "content"]],

    ["list.push", ["var", "chapters"], ["var", "newChapter"]],
    ["set", "this", "chapters", ["var", "chapters"]], // Save back to entity
    ["tell", "me", "Chapter added."],
  ]);

  addVerb(bookId, "search_chapters", [
    "seq",
    ["let", "query", ["str.lower", ["arg", 0]]],
    ["let", "chapters", ["prop", "this", "chapters"]],
    [
      "let",
      "results",
      [
        "list.filter",
        ["var", "chapters"],
        [
          "lambda",
          ["c"],
          [
            "or",
            [
              "str.includes",
              ["str.lower", ["obj.get", ["var", "c"], "title"]],
              ["var", "query"],
            ],
            [
              "str.includes",
              ["str.lower", ["obj.get", ["var", "c"], "content"]],
              ["var", "query"],
            ],
          ],
        ],
      ],
    ],
    [
      "tell",
      "me",
      [
        "str.concat",
        "Found ",
        ["list.len", ["var", "results"]],
        " matches:\n",
        [
          "str.join",
          [
            "list.map",
            ["var", "results"],
            ["lambda", ["c"], ["obj.get", ["var", "c"], "title"]],
          ],
          "\n",
        ],
      ],
    ],
  ]);
}
