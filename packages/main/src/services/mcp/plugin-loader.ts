/**
 * MCP Plugin Loader
 * Scans plugin directories and merges their contributions into MCP.
 * 
 * Plugin structure:
 *   plugins/my-plugin/
 *     .codex-plugin/
 *       plugin.json     -> { name, version, contributes: { resources?, tools?, prompts? } }
 *     resources/         -> {name}.md files registered as qserial://docs/{name}
 *     prompts/           -> {name}.md files registered as prompt templates
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  contributes: {
    resources?: Array<{ uri: string; name: string; description: string; mimeType?: string }>;
    prompts?: Array<{
      name: string;
      description: string;
      arguments?: Array<{ name: string; description: string; required?: boolean }>;
    }>;
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  resources: Map<string, { mimeType: string; content: string }>;
  prompts: Map<string, { description: string; content: string; args?: Array<{ name: string; description: string; required?: boolean }> }>;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

/** Get plugin search paths */
function getPluginPaths(): string[] {
  const paths: string[] = [];
  // 1. Built-in plugins directory (relative to app)
  try {
    const builtin = path.resolve(__dirname, "../../../plugins");
    if (fs.existsSync(builtin)) paths.push(builtin);
  } catch { /* ignore */ }
  // 2. User plugins directory
  try {
    const userPlugins = path.join(app.getPath("userData"), "plugins");
    if (fs.existsSync(userPlugins)) paths.push(userPlugins);
  } catch {
    // Fallback: try process.cwd()
    const cwdPlugins = path.join(process.cwd(), "plugins");
    if (fs.existsSync(cwdPlugins)) paths.push(cwdPlugins);
  }
  return paths;
}

/** Scan and load all plugins */
export function loadPlugins(): void {
  loadedPlugins.clear();
  for (const pluginsDir of getPluginPaths()) {
    if (!fs.existsSync(pluginsDir)) continue;
    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, ".codex-plugin", "plugin.json");
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const plugin: LoadedPlugin = {
          manifest,
          dir: pluginDir,
          resources: new Map(),
          prompts: new Map(),
        };

        // Load resource files
        const resDir = path.join(pluginDir, "resources");
        if (fs.existsSync(resDir)) {
          for (const f of fs.readdirSync(resDir)) {
            if (f.endsWith(".md") || f.endsWith(".json")) {
              const name = f.replace(/\.(md|json)$/, "");
              const content = fs.readFileSync(path.join(resDir, f), "utf-8");
              const mimeType = f.endsWith(".json") ? "application/json" : "text/markdown";
              plugin.resources.set(name, { mimeType, content });
            }
          }
        }

        // Load prompt files
        const promptsDir = path.join(pluginDir, "prompts");
        if (fs.existsSync(promptsDir)) {
          for (const f of fs.readdirSync(promptsDir)) {
            if (f.endsWith(".md")) {
              const name = f.replace(/\.md$/, "");
              const content = fs.readFileSync(path.join(promptsDir, f), "utf-8");
              plugin.prompts.set(name, { description: `Plugin prompt: ${name}`, content });
            }
          }
        }

        loadedPlugins.set(manifest.name, plugin);
        console.log(`[Plugin] Loaded: ${manifest.name} v${manifest.version}`);
      } catch (err) {
        console.error(`[Plugin] Failed to load ${entry.name}:`, (err as Error).message);
      }
    }
  }
}

/** Get all loaded plugin manifests */
export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

/** Get plugin-contributed resources (merged) */
export function getPluginResources(): Array<{ uri: string; name: string; description: string; mimeType: string }> {
  const result: Array<{ uri: string; name: string; description: string; mimeType: string }> = [];
  for (const plugin of loadedPlugins.values()) {
    // Manifest-declared resources
    if (plugin.manifest.contributes.resources) {
      for (const r of plugin.manifest.contributes.resources) {
        result.push({ ...r, mimeType: r.mimeType || "text/markdown" });
      }
    }
    // File-based resources
    for (const [name, res] of plugin.resources) {
      result.push({
        uri: `qserial://docs/${plugin.manifest.name}/${name}`,
        name: `${plugin.manifest.name}/${name}`,
        description: `Plugin resource: ${name}`,
        mimeType: res.mimeType,
      });
    }
  }
  return result;
}

/** Read a plugin resource by URI */
export function readPluginResource(uri: string): { mimeType: string; text: string } | null {
  for (const plugin of loadedPlugins.values()) {
    for (const [name, res] of plugin.resources) {
      if (uri === `qserial://docs/${plugin.manifest.name}/${name}`) {
        return { mimeType: res.mimeType, text: res.content };
      }
    }
  }
  return null;
}

/** Get plugin-contributed prompts (merged) */
export function getPluginPrompts(): Array<{
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}> {
  const result: Array<{
    name: string;
    description: string;
    arguments?: Array<{ name: string; description: string; required?: boolean }>;
  }> = [];
  for (const plugin of loadedPlugins.values()) {
    if (plugin.manifest.contributes.prompts) {
      result.push(...plugin.manifest.contributes.prompts);
    }
    for (const [name, prompt] of plugin.prompts) {
      result.push({ name: `${plugin.manifest.name}/${name}`, description: prompt.description });
    }
  }
  return result;
}

/** Get a plugin prompt by name */
export function getPluginPrompt(name: string): string | null {
  for (const plugin of loadedPlugins.values()) {
    const prefix = `${plugin.manifest.name}/`;
    if (name.startsWith(prefix)) {
      const promptName = name.slice(prefix.length);
      const prompt = plugin.prompts.get(promptName);
      if (prompt) return prompt.content;
    }
  }
  return null;
}
