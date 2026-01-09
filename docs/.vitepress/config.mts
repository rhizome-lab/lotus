import { defineConfig } from "vitepress";
import fs from "node:fs";
import path from "node:path";
import { withMermaid } from "vitepress-plugin-mermaid";

const SPECIAL_CASE_WORDS: Record<string, string> = {
  cli: "CLI",
  tui: "TUI",
};

// Helper to generate sidebar items dynamically
function getSidebarItems(dir: string) {
  const fullPath = path.join(__dirname, "..", dir);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  return fs
    .readdirSync(fullPath)
    .filter((file) => file.endsWith(".md") && file !== "index.md")
    .map((file) => {
      const name = path.basename(file, ".md");
      // Convert snake_case or kebab-case to Title Case for display
      const text = name
        .replaceAll(/[-_]/g, " ")
        .replaceAll(
          /\w+/g,
          (word) => SPECIAL_CASE_WORDS[word] ?? word.replace(/^./, (char) => char.toUpperCase()),
        );
      return { link: `/${dir}/${name}`, text };
    });
}

export default withMermaid(
  defineConfig({
    base: "/lotus/",
    description: "Documentation for the Lotus project",
    themeConfig: {
      nav: [
        { link: "/", text: "Home" },
        { link: "/playground/", target: "_blank", text: "Playground" },
        { link: "/core/architecture", text: "Architecture" },
        { link: "/scripting/spec", text: "Scripting" },
        { link: "https://rhizome-lab.github.io/", text: "Rhizome" },
      ],

      search: {
        provider: "local",
      },

      sidebar: [
        {
          items: [
            { link: "/vision", text: "Vision" },
            { link: "/challenges", text: "Challenges" },
            { link: "/automation", text: "Automation" },
          ],
          text: "Introduction",
        },
        {
          items: getSidebarItems("core"),
          text: "Core",
        },
        {
          items: getSidebarItems("components"),
          text: "Components",
        },
        {
          items: getSidebarItems("scripting"),
          text: "Scripting",
        },
        {
          items: getSidebarItems("reference"),
          text: "Reference",
        },
        {
          items: getSidebarItems("apps"),
          text: "Applications",
        },
        {
          items: getSidebarItems("plugins"),
          text: "Plugins",
        },
        {
          items: [
            { link: "/development", text: "Building Docs" },
            { link: "/codegen", text: "Type Generation" },
            { link: "/quality", text: "Quality Guide" },
          ],
          text: "Development",
        },
      ],

      socialLinks: [{ icon: "github", link: "https://github.com/rhizome-lab/lotus" }],
    },
    title: "Lotus",
    vite: {
      server: {
        proxy: {
          "/lotus/playground": {
            changeOrigin: true,
            target: `http://localhost:${process.env.PLAYGROUND_PORT ?? 3001}`,
          },
        },
      },
    },
  }),
);
