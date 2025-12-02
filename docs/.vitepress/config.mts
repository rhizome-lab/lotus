import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Viwo Docs",
  description: "Documentation for the Viwo project",
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Architecture", link: "/architecture" },
      { text: "Scripting", link: "/scripting_spec" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Codebase Map", link: "/codebase_map" },
          { text: "Web Frontend", link: "/web_frontend" },
          { text: "Discord Bot", link: "/discord_bot" },
        ],
      },
      {
        text: "Scripting",
        items: [
          { text: "Specification", link: "/scripting_spec" },
          { text: "Compiler", link: "/compiler" },
          { text: "Decompiler", link: "/decompiler" },
          { text: "Transpiler", link: "/transpiler" },
          { text: "Scheduler", link: "/scheduler" },
          { text: "API", link: "/api" },
        ],
      },
      {
        text: "Plugins",
        items: [{ text: "AI Integration", link: "/plugins/ai" }],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/pterror/viwo" }],
  },
});
