import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import fs from "node:fs";
import path from "node:path";

// Helper to generate sidebar items dynamically
function getSidebarItems(dir: string) {
  const fullPath = path.join(__dirname, "..", dir);
  if (!fs.existsSync(fullPath)) return [];

  return fs
    .readdirSync(fullPath)
    .filter((file) => file.endsWith(".md") && file !== "index.md")
    .map((file) => {
      const name = path.basename(file, ".md");
      // Convert snake_case or kebab-case to Title Case for display
      const text = name
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      return {
        text,
        link: `/${dir}/${name}`,
      };
    });
}

export default withMermaid(
  defineConfig({
    base: "/viwo/",
    title: "Viwo Docs",
    description: "Documentation for the Viwo project",
    themeConfig: {
      nav: [
        { text: "Home", link: "/" },
        { text: "Architecture", link: "/core/architecture" },
        { text: "Scripting", link: "/scripting/spec" },
      ],

      sidebar: [
        {
          text: "Core",
          items: getSidebarItems("core"),
        },
        {
          text: "Components",
          items: getSidebarItems("components"),
        },
        {
          text: "Scripting",
          items: getSidebarItems("scripting"),
        },
        {
          text: "Reference",
          items: getSidebarItems("reference"),
        },
        {
          text: "Applications",
          items: getSidebarItems("apps"),
        },
        {
          text: "Plugins",
          items: getSidebarItems("plugins"),
        },
      ],

      socialLinks: [
        { icon: "github", link: "https://github.com/pterror/viwo" },
      ],
    },
  }),
);
