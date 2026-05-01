import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { readdirSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { Agent, type AgentMessage } from "../agent/index.js";
import { configService } from "../services/config.js";
import { findProjectRoot, getMemoryPath } from "../prompts/system.js";
import { getSkillByName, discoverSkills, getSkillsDir, sanitizeSkillName } from "../services/skills.js";
import {
  providers,
  getProvider,
  getModelInfo,
  fetchModelsFromAPI,
  type Provider,
  type ModelInfo,
} from "../services/providers.js";
import type { McpManager } from "../services/mcp-manager.js";
import { logger } from "../services/logger.js";
import Header from "./components/Header.js";
import MessageList from "./components/MessageList.js";
import InputArea from "./components/InputArea.js";
import StatusBar from "./components/StatusBar.js";
import WorkingIndicator from "./components/WorkingIndicator.js";
import { checkForUpdate } from "../services/update-check.js";
import { useMessageProcessing } from "./hooks/useMessageProcessing.js";
import {
  getCommands,
  getCommandSuggestions,
  matchCommand,
  formatCommandName,
} from "./commands.js";

function setTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x1b\x07`);
}

interface AppProps {
  agent: Agent;
  mcpManager?: McpManager;
  version: string;
  resumeChatId?: string;
}

type SuggestionItem = {
  type: "command" | "file";
  name?: string;
  displayName?: string;
  description?: string;
  path?: string;
  isDir?: boolean;
  label?: string;
};

type MenuMode =
  | { type: "provider-select" }
  | { type: "provider-apikey"; provider: Provider }
  | { type: "model-select"; provider: Provider }
  | { type: "settings" };

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  "__pycache__",
  ".cache",
  "coverage",
  "build",
]);

function searchRecursive(
  query: string,
  dir: string,
  depth: number,
): SuggestionItem[] {
  if (depth > 3) return [];
  const results: SuggestionItem[] = [];
  const lowerQuery = query.toLowerCase();
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue;
      const fullPath = dir === "." ? item.name : `${dir}/${item.name}`;
      if (item.isDirectory()) {
        if (item.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: "file",
            path: fullPath + "/",
            isDir: true,
            label: fullPath + "/",
          });
        }
        if (depth < 2)
          results.push(
            ...searchRecursive(query, join(dir, item.name), depth + 1),
          );
      } else if (item.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: "file",
          path: fullPath,
          isDir: false,
          label: fullPath,
        });
      }
      if (results.length >= 20) break;
    }
  } catch {
    /* ignore */
  }
  return results;
}

function getFileSuggestions(query: string): SuggestionItem[] {
  if (!query) return searchRecursive(".", ".", 0);
  const parts = query.split("/");
  const prefix = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
  const dir = prefix === "" ? "." : prefix;
  const filePart = parts[parts.length - 1].toLowerCase();
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    const results: SuggestionItem[] = [];
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue;
      if (!item.name.toLowerCase().includes(filePart)) continue;
      const fullPath = dir === "." ? item.name : `${dir}/${item.name}`;
      results.push({
        type: "file",
        path: fullPath,
        isDir: item.isDirectory(),
        label: fullPath,
      });
    }
    return results.slice(0, 15);
  } catch {
    return [];
  }
}

function getAtMention(
  input: string,
): { query: string; atIndex: number } | null {
  const match = input.match(/@(\S*)$/);
  if (!match) return null;
  return { query: match[1], atIndex: match.index! };
}

function applyFileSuggestion(input: string, filePath: string): string {
  const atIndex = input.lastIndexOf("@");
  const before = input.slice(0, atIndex);
  const rest = input.slice(atIndex).replace(/@\S*/, "");
  return `${before}@${filePath} ${rest.trim()}`;
}

function SettingsMenu({
  settings,
  selectedIndex,
  onToggle,
}: {
  settings: Array<{ key: string; label: string; enabled: boolean }>;
  selectedIndex: number;
  onToggle: (idx: number) => void;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="white">Settings:</Text>
      {settings.map((s, idx) => {
        const sel = idx === selectedIndex;
        const status = s.enabled ? "enabled" : "disabled";
        return (
          <Box key={s.key}>
            {sel ? (
              <Text backgroundColor="white" color="black" bold>
                {sel ? "› " : "  "}
                {s.label.padEnd(20)} {status}
              </Text>
            ) : (
              <Text color="gray">
                {sel ? "› " : "  "}
                {s.label.padEnd(20)}{" "}
                <Text color={s.enabled ? "green" : "gray"}>{status}</Text>
              </Text>
            )}
          </Box>
        );
      })}
      <Text color="gray" dimColor>
        {" "}
        ↑↓ select Space toggle Enter/Esc close
      </Text>
    </Box>
  );
}

function ProviderMenu({
  menu,
  selectedIndex,
  apikeyInput,
  dynamicModels,
  modelsLoading,
}: {
  menu: MenuMode | null;
  selectedIndex: number;
  apikeyInput: string;
  dynamicModels: ModelInfo[] | null;
  modelsLoading: boolean;
}) {
  if (!menu) return null;

  if (menu.type === "provider-select") {
    const currentProvider = configService.getProvider() || "fireworks";
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="white">Provider:</Text>
        {providers.map((p, idx) => {
          const sel = idx === selectedIndex;
          const isCurrent = p.id === currentProvider;
          return (
            <Box key={p.id}>
              {sel ? (
                <Text backgroundColor="white" color="black" bold>
                  {p.name}
                </Text>
              ) : (
                <Text color="gray">{p.name}</Text>
              )}
              {isCurrent && (
                <Text color="gray" dimColor>
                  {" "}
                  current
                </Text>
              )}
            </Box>
          );
        })}
        <Text color="gray" dimColor>
          {" "}
          ↑↓ select Enter confirm Esc cancel
        </Text>
      </Box>
    );
  }

  if (menu.type === "provider-apikey") {
    const keyPreview =
      apikeyInput.length > 0
        ? "*".repeat(Math.min(apikeyInput.length, 20))
        : "";
    const hasKey = !!configService.getProviderKey(menu.provider.id);
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="white">{menu.provider.name} — API Key</Text>
        {hasKey && (
          <Text color="gray" dimColor>
            Key already set — Enter to keep, Esc to skip
          </Text>
        )}
        <Box>
          <Text color="gray">Key: </Text>
          <Text color="white">{keyPreview || "(empty)"}</Text>
          <Text inverse> </Text>
        </Box>
        <Text color="gray" dimColor>
          {" "}
          Enter confirm Esc skip
        </Text>
      </Box>
    );
  }

  if (menu.type === "model-select") {
    const currentModel = configService.getModel();
    // dynamicModels: null = haven't fetched, [] = API returned empty, ModelInfo[] = from API
    // Use API models if available, fall back to static list if API returned nothing
    const models = (dynamicModels && dynamicModels.length > 0)
      ? dynamicModels
      : menu.provider.models;
    const isLive = dynamicModels !== null && dynamicModels.length > 0;
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="white">{menu.provider.name} — Model:</Text>
        {isLive && models.length > 0 && (
          <Text color="green" dimColor> live</Text>
        )}
        {models.length === 0 ? (
          <Text color="gray" dimColor>
            {" "}
            {modelsLoading ? "Fetching models..." : isLive ? "No models found" : "Set API key to fetch models"}
          </Text>
        ) : (
          models.map((m, idx) => {
            const sel = idx === selectedIndex;
            const isCurrent = m.id === currentModel;
            return (
              <Box key={m.id}>
                {sel ? (
                  <Text backgroundColor="white" color="black" bold>
                    {m.name}
                  </Text>
                ) : (
                  <Text color="gray">{m.name}</Text>
                )}
                <Text color="gray" dimColor>
                  {" "}
                  — {m.description}
                </Text>
                {isCurrent && (
                  <Text color="gray" dimColor>
                    {" "}
                    current
                  </Text>
                )}
              </Box>
            );
          })
        )}
        <Text color="gray" dimColor>
          {" "}
          ↑↓ select Enter confirm Esc cancel
        </Text>
      </Box>
    );
  }

  return null;
}

function SuggestionBar({
  suggestions,
  selectedIndex,
  onSelect,
  onExecute,
}: {
  suggestions: SuggestionItem[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
  onExecute: (idx: number) => void;
}) {
  const isCmd = suggestions[0]?.type === "command";

  if (isCmd) {
    return (
      <Box flexDirection="column" marginTop={1}>
        {suggestions.map((item, idx) => {
          const sel = idx === selectedIndex;
          return (
            <Box key={idx}>
              {sel ? (
                <Text backgroundColor="white" color="black" bold>
                  {item.displayName || item.name}
                </Text>
              ) : (
                <Text color="gray">{item.displayName || item.name}</Text>
              )}
              <Text color="gray" dimColor>
                {" "}
                — {item.description}
              </Text>
            </Box>
          );
        })}
        <Text color="gray" dimColor>
          {" "}
          ↑↓ select Enter run Tab fill Esc close
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {suggestions.slice(0, 8).map((item, idx) => {
        const sel = idx === selectedIndex;
        return (
          <Box key={idx}>
            <Text
              color={sel ? "black" : item.isDir ? "yellow" : "gray"}
              backgroundColor={sel ? "white" : undefined}
            >
              {sel ? " → " : "   "}
              {item.isDir ? "▸ " : "  "}
              {item.label}
            </Text>
          </Box>
        );
      })}
      <Text color="gray" dimColor>
        {" "}
        ↑↓ select Tab/Enter fill Esc close
      </Text>
    </Box>
  );
}

function App({ agent, mcpManager, version, resumeChatId }: AppProps) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [currentDir, setCurrentDir] = useState(process.cwd());
  const suggestionExecutedRef = useRef(false);
  const pendingCompactRef = useRef(false);

  const uiSettings = configService.getUiSettings();
  const [cleanMode, setCleanMode] = useState(uiSettings.cleanMode ?? false);
  const [enableAnimation, setEnableAnimation] = useState(
    uiSettings.enableAnimation ?? true,
  );
  const [showThinking, setShowThinking] = useState(
    uiSettings.showThinking ?? true,
  );
  const [autoCompact, setAutoCompact] = useState(
    uiSettings.autoCompact ?? false,
  );

  const [needsSetup, setNeedsSetup] = useState(() => {
    const apiKey = configService.getApiKey();
    return !apiKey || apiKey.trim() === "";
  });

  const [menu, setMenu] = useState<MenuMode | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [apikeyInput, setApikeyInput] = useState("");
  const [dynamicModels, setDynamicModels] = useState<ModelInfo[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  // Check for updates on startup
  useEffect(() => {
    const currentVersion = version.replace(/^v/, "");
    checkForUpdate(currentVersion).then((v) => {
      if (v) {
        setUpdateVersion(v);
        addSystemMessage(
          `✦ Update available: v${currentVersion} → v${v}\n  Run: npm i -g @todlabs/tod`,
        );
      }
    });
  }, []);

  const {
    messages,
    currentThinking,
    isProcessing,
    status,
    pendingCount,
    processMessage,
    stopProcessing,
    resetMessages,
    addMessage,
    currentChatId,
    currentChatName,
    resumeChat,
    getChatList,
    compactMessages,
  } = useMessageProcessing(agent);

  const totalTokens =
    messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4;

  const settingsItems: Array<{ key: string; label: string; enabled: boolean }> =
    [
      {
        key: "cleanMode",
        label: "Clean mode (no ctx bar)",
        enabled: cleanMode,
      },
      { key: "enableAnimation", label: "Animation", enabled: enableAnimation },
      { key: "showThinking", label: "Show thinking", enabled: showThinking },
      {
        key: "autoCompact",
        label: "Auto compact at 80%",
        enabled: autoCompact,
      },
    ];

  // Auto-compact effect: after each processed turn, check threshold
  useEffect(() => {
    if (!autoCompact || isProcessing || pendingCompactRef.current) return;
    const maxContext = (() => {
      const providerId = configService.getProvider() || "fireworks";
      const modelId = configService.getModel();
      const info = getModelInfo(providerId, modelId);
      return info?.contextLength || 128000;
    })();
    const threshold = uiSettings.autoCompactThreshold || 80;
    const pct = Math.round((totalTokens / maxContext) * 100);
    if (pct >= threshold) {
      pendingCompactRef.current = true;
      compactMessages()
        .then((result) => {
          const savedPct = Math.round(
            ((result.oldTokens - result.newTokens) / result.oldTokens) * 100,
          );
          const newPct = Math.round(
            (result.newTokens / maxContext) * 100,
          );
          addSystemMessage(
            `◆ auto-compacted\n  ${pct}% → ${newPct}% of context  ·  −${savedPct}%`,
          );
          pendingCompactRef.current = false;
        })
        .catch(() => {
          pendingCompactRef.current = false;
        });
    }
  }, [messages.length, isProcessing, autoCompact]);

  useEffect(() => {
    if (resumeChatId) {
      const ok = resumeChat(resumeChatId);
      if (ok) addSystemMessage(`Resumed chat: ${resumeChatId}`);
      else addSystemMessage(`Chat ${resumeChatId} not found`);
    }
  }, []);

  useEffect(() => {
    if (needsSetup && !resumeChatId) {
      addSystemMessage(
        "Welcome to TOD! No API key configured.\nUse /providers to select a provider and set your API key.",
      );
      openProviderMenu();
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      try {
        setCurrentDir(process.cwd());
      } catch {
        /* */
      }
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const modelName =
      configService.getModel().split("/").pop() || configService.getModel();
    setTitle(`TOD ${version} · ${modelName}`);
  }, [version]);

  useEffect(() => {
    setSelectedSuggestionIndex(-1);
    if (menu) {
      setSuggestions([]);
      return;
    }
    if (!input.startsWith("/") && !getAtMention(input)) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      if (input.startsWith("/")) {
        const cmds = getCommandSuggestions(input, process.cwd());
        setSuggestions(
          cmds.map((c) => ({
            type: "command",
            name: c.name,
            displayName: formatCommandName(c),
            description: c.description,
          })),
        );
      } else {
        const mention = getAtMention(input);
        if (mention) setSuggestions(getFileSuggestions(mention.query));
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [input, menu]);

  const hasSuggestions = suggestions.length > 0;

  function fillSuggestion(idx: number) {
    const item = suggestions[idx];
    if (!item) return;
    if (item.type === "command") setInput(item.name + " ");
    else setInput(applyFileSuggestion(input, item.path!));
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
  }

  function executeSuggestion(idx: number) {
    const item = suggestions[idx];
    if (!item) return;
    suggestionExecutedRef.current = true;
    if (item.type === "command") {
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
      setInput("");
      handleCommand(item.name!);
    } else {
      setInput(applyFileSuggestion(input, item.path!));
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
    }
  }

  function openProviderMenu() {
    setMenu({ type: "provider-select" });
    setMenuIndex(0);
    setApikeyInput("");
  }
  function selectProvider(provider: Provider) {
    setMenu({ type: "provider-apikey", provider });
    setApikeyInput("");
  }

  function openModelMenu(provider: Provider) {
    setMenu({ type: "model-select", provider });
    setMenuIndex(0);
    setDynamicModels(null);
    setModelsLoading(false);
    const apiKey =
      configService.getProviderKey(provider.id) || configService.getApiKey();
    const providerCfg = configService.getProviderConfig(provider.id);
    if (apiKey) {
      setModelsLoading(true);
      fetchModelsFromAPI(provider.baseURL, apiKey, providerCfg.headers).then((models) => {
        setDynamicModels(models);
        setModelsLoading(false);
      });
    }
  }

  function selectModel(provider: Provider, model: ModelInfo) {
    configService.setModel(model.id);
    if (model.maxTokens) {
      const cfg = configService.getProviderConfig(configService.getProvider());
      cfg.maxTokens = model.maxTokens;
    }
    agent.updateConfig(configService.getAgentConfig());
    setMenu(null);
    setDynamicModels(null);
    setNeedsSetup(false);
    const ctx = model.contextLength
      ? ` (${Math.round(model.contextLength / 1000)}K ctx)`
      : "";
    addSystemMessage(`${provider.name} → ${model.name}${ctx}`);
  }

  function openSettingsMenu() {
    if (menu && menu.type === "settings") {
      closeMenu();
      return;
    }
    setMenu({ type: "settings" });
    setMenuIndex(0);
  }

  // --- Suggestion & ESC callbacks for MultilineInput ---
  const handleSuggestionNavigate = useCallback(
    (direction: "up" | "down") => {
      if (direction === "up") {
        setSelectedSuggestionIndex((prev) => Math.max(prev - 1, -1));
      } else {
        setSelectedSuggestionIndex((prev) =>
          prev < 0 ? 0 : Math.min(prev + 1, suggestions.length - 1),
        );
      }
    },
    [suggestions.length],
  );

  const handleSuggestionFill = useCallback(
    (idx: number) => {
      fillSuggestion(idx);
    },
    [suggestions],
  );

  const handleSuggestionExecute = useCallback(
    (idx: number) => {
      executeSuggestion(idx);
    },
    [suggestions],
  );

  const handleEscape = useCallback(() => {
    if (hasSuggestions) {
      setSuggestions([]);
      setSelectedSuggestionIndex(-1);
      return;
    }
    if (isProcessing) {
      agent.abort();
      stopProcessing();
      return;
    }
  }, [hasSuggestions, isProcessing, agent, stopProcessing]);

  function closeMenu() {
    setMenu(null);
    setMenuIndex(0);
    setApikeyInput("");
    setDynamicModels(null);
  }

  function toggleSetting(idx: number) {
    const item = settingsItems[idx];
    if (!item) return;
    switch (item.key) {
      case "cleanMode":
        setCleanMode((prev) => {
          configService.setUiSetting("cleanMode", !prev);
          return !prev;
        });
        break;
      case "enableAnimation":
        setEnableAnimation((prev) => {
          configService.setUiSetting("enableAnimation", !prev);
          return !prev;
        });
        break;
      case "showThinking":
        setShowThinking((prev) => {
          configService.setUiSetting("showThinking", !prev);
          return !prev;
        });
        break;
      case "autoCompact":
        setAutoCompact((prev) => {
          configService.setUiSetting("autoCompact", !prev);
          return !prev;
        });
        break;
    }
  }

  // Menu-only input handler — only active when a menu is open.
  // All other input (typing, suggestions, ESC) is handled by MultilineInput.
  useInput(
    (inputChar, key) => {
      if (!menu) return; // safety — isActive should prevent this

      if (key.escape) {
        if (menu.type === "provider-apikey") {
          configService.setProvider(menu.provider.id);
          setMenu({ type: "model-select", provider: menu.provider });
          setMenuIndex(0);
          return;
        }
        closeMenu();
        return;
      }
      if (menu.type === "provider-select") {
        if (key.downArrow) {
          setMenuIndex((prev) => Math.min(prev + 1, providers.length - 1));
          return;
        }
        if (key.upArrow) {
          setMenuIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (key.return) {
          selectProvider(providers[menuIndex]);
          return;
        }
        return;
      }
      if (menu.type === "provider-apikey") {
        if (key.return) {
          const key2 = apikeyInput.trim() || undefined;
          configService.setProvider(menu.provider.id, key2);
          openModelMenu(menu.provider);
          return;
        }
        if (key.backspace || key.delete) {
          setApikeyInput((prev) => prev.slice(0, -1));
          return;
        }
        if (inputChar && !key.ctrl && !key.meta) {
          setApikeyInput((prev) => prev + inputChar);
          return;
        }
        return;
      }
      if (menu.type === "model-select") {
        const models = (dynamicModels && dynamicModels.length > 0)
          ? dynamicModels
          : menu.provider.models;
        if (models.length === 0) return;
        if (key.downArrow) {
          setMenuIndex((prev) => Math.min(prev + 1, models.length - 1));
          return;
        }
        if (key.upArrow) {
          setMenuIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (key.return) {
          selectModel(menu.provider, models[menuIndex]);
          return;
        }
        return;
      }
      if (menu.type === "settings") {
        if (key.downArrow) {
          setMenuIndex((prev) => Math.min(prev + 1, settingsItems.length - 1));
          return;
        }
        if (key.upArrow) {
          setMenuIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (key.return) {
          toggleSetting(menuIndex);
          return;
        }
        if (inputChar === " ") {
          toggleSetting(menuIndex);
          return;
        }
        return;
      }
    },
    { isActive: !!menu },
  );

  function handleCommand(rawInput: string) {
    const resolvedCmd = matchCommand(rawInput, process.cwd());
    if (!resolvedCmd) {
      addSystemMessage("Unknown command. Type /help for available commands.");
      return;
    }

    // Extract arguments after the command
    const parts = rawInput.trim().split(/\s+/);
    const originalCmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ").trim();

    switch (resolvedCmd) {
      case "/provider":
      case "/providers":
        openProviderMenu();
        break;
      case "/model":
      case "/models": {
        const providerId = configService.getProvider() || "fireworks";
        const provider = getProvider(providerId);
        if (provider) openModelMenu(provider);
        break;
      }
      case "/thinking":
        setShowThinking((prev) => {
          const next = !prev;
          configService.setUiSetting("showThinking", next);
          addSystemMessage(`Thinking display ${next ? "enabled" : "disabled"}`);
          return next;
        });
        break;
      case "/settings":
        openSettingsMenu();
        break;
      case "/clear":
        process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
        resetMessages();
        break;
      case "/compact":
        handleCompactContext();
        break;
      case "/resume": {
        const targetId = parts[1];
        if (targetId) {
          const ok = resumeChat(targetId);
          if (ok) addSystemMessage(`Resumed: ${targetId}`);
          else addSystemMessage(`Chat ${targetId} not found`);
        } else {
          const chats = getChatList().slice(0, 5);
          if (chats.length === 0) {
            addSystemMessage("No saved chats");
          } else {
            const lines = chats.map((c) => {
              const date = new Date(c.updatedAt).toLocaleDateString();
              return `  ${c.id}  ${c.name}  (${c.messageCount} msgs, ${date})`;
            });
            addSystemMessage(
              `Recent chats:\n${lines.join("\n")}\n\nResume with: /resume <id>`,
            );
          }
        }
        break;
      }
      case "/help": {
        const allCmds = getCommands(process.cwd());
        const helpText = allCmds
          .map((c) => `  ${formatCommandName(c).padEnd(28)} ${c.description}`)
          .join("\n");
        addSystemMessage(`Commands:\n\n${helpText}`);
        break;
      }
      case "/exit": {
        exit();
        return;
      }
      case "/init": {
        handleInit();
        break;
      }
      case "/skill": {
        const skillArg = rawInput.replace(/^\/skill\s*/i, "").trim();
        if (!skillArg) {
          // List existing skills
          const skills = discoverSkills(process.cwd());
          if (skills.length === 0) {
            addSystemMessage("No skills found. Create one: /skill <name> <description>");
          } else {
            const lines = skills.map((s) => {
              const inv = s.invocation === "always" ? "always-on" : "on-demand";
              return `  /${s.name}  ${s.description}  (${s.source}, ${inv})`;
            });
            addSystemMessage(`Skills:\n\n${lines.join("\n")}\n\nCreate: /skill <what you want>\nEdit: .tod/skills/<name>/SKILL.md`);
          }
        } else {
          // Create a new skill — delegate to agent
          const skillsDir = getSkillsDir(process.cwd());

          const createPrompt = `Create a skill based on this request: "${skillArg}"

Steps:
1. Invent a short, descriptive skill name (lowercase, hyphenated, english — e.g. "auto-commit", "code-style", "deploy-check")
2. Write a clear description of what the skill does
3. Decide invocation: "always" if this is a rule the agent must always follow, "on-demand" if it's a procedure to invoke manually
4. Write practical, step-by-step instructions in the body

Create the file at ${skillsDir}/<name>/SKILL.md with this format:

---
description: <your description>
invocation: <always or on-demand>
---

<step-by-step instructions>

First create the directory with create_directory, then use write_file to create SKILL.md. Make it concise and actionable.`;

          addSystemMessage(`Creating skill...`);
          processMessage(createPrompt);
        }
        break;
      }
      case "/remember": {
        const note = rawInput.replace(/^\/remember\s*/i, "").trim();
        if (!note) {
          addSystemMessage("Usage: /remember <something to remember>");
          break;
        }
        const memoryPath = getMemoryPath(process.cwd());
        const memoryDir = join(memoryPath, "..");
        try {
          mkdirSync(memoryDir, { recursive: true });
          const timestamp = new Date().toISOString().split("T")[0];
          appendFileSync(memoryPath, `- [${timestamp}] ${note}\n`, "utf-8");
          addSystemMessage(`Remembered: ${note}`);
        } catch (error) {
          addSystemMessage(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
        }
        break;
      }
      case "/mcp":
        handleShowMcp();
        break;
      default: {
        // Check if it's a skill command
        const skillName = resolvedCmd.slice(1); // remove leading /
        const skill = getSkillByName(process.cwd(), skillName);
        if (skill) {
          const userArgs = rawInput.replace(/^\/\S+\s*/, "").trim();
          let prompt = skill.content;
          if (userArgs) {
            prompt += `\n\nAdditional context from user: ${userArgs}`;
          }
          addSystemMessage(`Running skill: /${skill.name}`);
          processMessage(prompt);
        } else {
          addSystemMessage(`Unknown command: ${resolvedCmd}`);
        }
        break;
      }
    }
  }

  const handleCompactContext = async () => {
    const startMsg = "◇ compacting context...";
    addSystemMessage(startMsg);
    try {
      const result = await compactMessages();
      const savedPct = Math.round(
        ((result.oldTokens - result.newTokens) / result.oldTokens) * 100,
      );
      const fmt = (n: number) => {
        if (n >= 1000) return (n / 1000).toFixed(1) + "k";
        return n.toString();
      };
      const before = fmt(result.oldTokens);
      const after = fmt(result.newTokens);
      addSystemMessage(
        `◆ context compacted\n  ${before} → ${after} tokens  ·  −${savedPct}%`,
      );
    } catch (error) {
      addSystemMessage(
        `✗ compact failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleInit = () => {
    const root = findProjectRoot(process.cwd());
    const agentsPath = join(root, "AGENTS.md");

    if (existsSync(agentsPath)) {
      addSystemMessage("AGENTS.md already exists — asking agent to update it...");
    }

    const initPrompt = `Analyze this project and create a useful AGENTS.md file at ${agentsPath}.

Look at the project structure, package.json / cargo.toml / pyproject.toml, build scripts, test setup, linting config, existing source files, and any existing documentation. Then write an AGENTS.md that contains REAL, SPECIFIC information — not placeholders.

Include sections like:
- **Build & Test**: exact commands (e.g. "bun run build", "bun test", "bunx tsc --noEmit")
- **Code Style**: language, framework, formatting rules you observe from existing code
- **Conventions**: file naming patterns, import style, directory structure
- **Important Files**: entry points, config files, key modules
- **Architecture**: how the codebase is organized, key abstractions
- **Gotchas**: anything non-obvious about this project

Write the file using the write_file tool. Make it concise and practical — this file helps AI agents work effectively in this codebase.`;

    processMessage(initPrompt);
  };

  const handleShowMcp = () => {
    if (!mcpManager) {
      addSystemMessage("MCP not initialized");
      return;
    }
    const statuses = mcpManager.getStatus();
    if (statuses.length === 0) {
      addSystemMessage("No MCP servers configured");
      return;
    }
    const lines: string[] = ["MCP Servers:"];
    for (const s of statuses) {
      const icon =
        s.status === "connected" ? "●" : s.status === "error" ? "✗" : "○";
      lines.push(
        `  ${icon} ${s.name.padEnd(20)} ${s.status} (${s.toolCount} tools)`,
      );
      if (s.error) lines.push(`      Error: ${s.error}`);
    }
    addSystemMessage(lines.join("\n"));
  };

  const addSystemMessage = (content: string) => {
    addMessage({ role: "assistant", content });
  };

  const handleSubmit = async (value: string) => {
    if (suggestionExecutedRef.current) {
      suggestionExecutedRef.current = false;
      return;
    }
    if (menu) return;
    setInput("");
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);

    if (value.trim().startsWith("/")) {
      handleCommand(value.trim());
      return;
    }
    if (needsSetup) {
      addSystemMessage(
        "No API key configured. Use /providers to select a provider and set your API key.",
      );
      return;
    }
    await processMessage(value);
  };

  const modelName =
    configService.getModel().split("/").pop() || configService.getModel();
  const maxContext = (() => {
    const providerId = configService.getProvider() || "fireworks";
    const modelId = configService.getModel();
    const info = getModelInfo(providerId, modelId);
    return info?.contextLength || 128000;
  })();

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Header
        version={version}
        currentDir={currentDir}
        enableAnimation={enableAnimation}
      />
      <MessageList
        messages={messages}
        thinking={currentThinking}
        showThinking={showThinking}
      />
      {menu?.type === "settings" && (
        <SettingsMenu
          settings={settingsItems}
          selectedIndex={menuIndex}
          onToggle={toggleSetting}
        />
      )}
      <ProviderMenu
        menu={menu?.type === "settings" ? null : menu}
        selectedIndex={menuIndex}
        apikeyInput={apikeyInput}
        dynamicModels={dynamicModels}
        modelsLoading={modelsLoading}
      />
      {hasSuggestions && !menu && (
        <SuggestionBar
          suggestions={suggestions}
          selectedIndex={selectedSuggestionIndex}
          onSelect={(idx) => setSelectedSuggestionIndex(idx)}
          onExecute={executeSuggestion}
        />
      )}
      {isProcessing && !menu && (
        <Box>
          <WorkingIndicator status={status || undefined} enableAnimation={enableAnimation} />
          {pendingCount > 0 && (
            <Text color="yellow"> · {pendingCount} queued</Text>
          )}
        </Box>
      )}
      <InputArea
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isProcessing={isProcessing}
        hasPending={pendingCount > 0}
        needsSetup={needsSetup}
        isDisabled={!!menu}
        hasSuggestions={hasSuggestions}
        selectedSuggestionIndex={selectedSuggestionIndex}
        suggestionCount={suggestions.length}
        onSuggestionNavigate={handleSuggestionNavigate}
        onSuggestionFill={handleSuggestionFill}
        onSuggestionExecute={handleSuggestionExecute}
        onEscape={handleEscape}
      />
      <StatusBar
        modelName={modelName}
        isProcessing={isProcessing}
        tokensUsed={totalTokens}
        maxContext={maxContext}
        mcpStatus={mcpManager?.getStatusSummary()}
        cleanMode={cleanMode}
        updateVersion={updateVersion}
      />
      <Box height={1} />
    </Box>
  );
}

export default App;
