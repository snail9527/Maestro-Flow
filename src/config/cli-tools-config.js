// ---------------------------------------------------------------------------
// CLI Tools configuration loader
// Reads ~/.maestro/cli-tools.json for tool selection and model routing.
// ---------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
    version: '1.0.0',
    tools: {},
};
// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
/**
 * Load CLI tools configuration from ~/.maestro/cli-tools.json.
 * Returns a default empty config if the file does not exist or is invalid.
 */
export async function loadCliToolsConfig() {
    const configPath = join(homedir(), '.maestro', 'cli-tools.json');
    try {
        const raw = await readFile(configPath, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return DEFAULT_CONFIG;
    }
}
/**
 * Select a tool by explicit name or fall back to the first enabled tool.
 * Returns undefined when no tool can be resolved.
 */
export function selectTool(name, config) {
    // Exact match by name
    if (name && config.tools[name]?.enabled) {
        return { name, entry: config.tools[name] };
    }
    // Fallback: first enabled tool in config order
    for (const [toolName, entry] of Object.entries(config.tools)) {
        if (entry.enabled) {
            return { name: toolName, entry };
        }
    }
    return undefined;
}
/**
 * Build proxy environment variable overrides for a specific tool.
 * Returns an empty object when proxy is disabled globally or for the tool.
 */
export function resolveProxyEnv(config, toolName) {
    const proxy = config.proxy;
    if (!proxy?.enabled) return {};
    const toolEntry = config.tools?.[toolName];
    if (toolEntry?.proxy === false) return {};
    const env = {};
    const httpUrl = proxy.httpProxy;
    const httpsUrl = proxy.httpsProxy ?? httpUrl;
    if (httpUrl) {
        env.HTTP_PROXY = httpUrl;
        env.http_proxy = httpUrl;
    }
    if (httpsUrl) {
        env.HTTPS_PROXY = httpsUrl;
        env.https_proxy = httpsUrl;
    }
    if (proxy.noProxy) {
        env.NO_PROXY = proxy.noProxy;
        env.no_proxy = proxy.noProxy;
    }
    return env;
}
//# sourceMappingURL=cli-tools-config.js.map