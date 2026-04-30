import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { readdirSync } from "fs";
import { join } from "path";
import { Agent, type AgentMessage } from "../agent/index.js";
import { configService } from "../services/config.js";
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
import { useMessageProcessing } from "./hooks/useMessageProcessing.js";
import { commands, getCommandSuggestions, matchCommand, formatCommandName } from "./commands.js";
import WorkingIndicator from "./WorkingIndicator.js";

function setTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x07`);
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
  | { type: "model-select"; provider: Provider };

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

function searchRecursive(query: string, dir: string, depth: number): SuggestionItem[] {
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
          results.push({ type: "file", path: fullPath + "/", isDir: true, label: fullPath + "/" });
        }
        if (depth < 2) results.push(...searchRecursive(query, join(dir, item.name), depth + 1));
      } else if (item.name.toLowerCase().includes(lowerQuery)) {
        results.push({ type: "file", path: fullPath, isDir: false, label: fullPath });
      }
      if (results.length >= 20) break;
    }
  } catch { /* ignore */ }
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
      results.push({ type: "file", path: fullPath, isDir: item.isDirectory(), label: fullPath });
    }
    return results.slice(0, 15);
  } catch {
    return [];
  }
}

function getAtMention(input: string): { query: string; atIndex: number } | null {
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

function ProviderMenu({ menu, selectedIndex, apikeyInput, dynamicModels }: {
  menu: MenuMode | null; selectedIndex: number; apikeyInput: string; dynamicModels: ModelInfo[] | null;
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
              {sel ? <Text backgroundColor="white" color="black" bold>{p.name}</Text> : <Text color="gray">{p.name}</Text>}
              {isCurrent && <Text color="gray" dimColor> current</Text>}
            </Box>
          );
        })}
        <Text color="gray" dimColor> ↑↓ select Enter confirm Esc cancel</Text>
      </Box>
    );
  }

  if (menu.type === "provider-apikey") {
    const keyPreview = apikeyInput.length > 0 ? "*".repeat(Math.min(apikeyInput.length, 20)) : "";
    const hasKey = !!configService.getProviderKey(menu.provider.id);
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="white">{menu.provider.name} — API Key</Text>
        {hasKey && <Text color="gray" dimColor>Key already set — Enter to keep, Esc to skip</Text>}
        <Box>
          <Text color="gray">Key: </Text>
          <Text color="white">{keyPreview || "(empty)"}</Text>
          <Text inverse> </Text>
        </Box>
        <Text color="gray" dimColor> Enter confirm Esc skip</Text>
      </Box>
    );
  }

  if (menu.type === "model-select") {
    const currentModel = configService.getModel();
    const models = dynamicModels || menu.provider.models;
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="white">{menu.provider.name} — Model:</Text>
        {models.length === 0 ? (
          <Text color="gray" dimColor> Fetching models...</Text>
        ) : (
          models.map((m, idx) => {
            const sel = idx === selectedIndex;
            const isCurrent = m.id === currentModel;
            return (
              <Box key={m.id}>
                {sel ? <Text backgroundColor="white" color="black" bold>{m.name}</Text> : <Text color="gray">{m.name}</Text>}
                <Text color="gray" dimColor> — {m.description}</Text>
                {isCurrent && <Text color="gray" dimColor> current</Text>}
              </Box>
            );
          })
        )}
        <Text color="gray" dimColor> ↑↓ select Enter confirm Esc cancel</Text>
      </Box>
    );
  }

  return null;
}

function SuggestionBar({ suggestions, selectedIndex, onSelect, onExecute }: {
  suggestions: SuggestionItem[]; selectedIndex: number; onSelect: (idx: number) => void; onExecute: (idx: number) => void;
}) {
  const isCmd = suggestions[0]?.type === "command";

  if (isCmd) {
    return (
      <Box flexDirection="column" marginTop={1}>
        {suggestions.map((item, idx) => {
          const sel = idx === selectedIndex;
          return (
            <Box key={idx}>
              {sel ? <Text backgroundColor="white" color="black" bold>{item.displayName || item.name}</Text> : <Text color="gray">{item.displayName || item.name}</Text>}
              <Text color="gray" dimColor> — {item.description}</Text>
            </Box>
          );
        })}
        <Text color="gray" dimColor> ↑↓ select Enter run Tab fill Esc close</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {suggestions.slice(0, 8).map((item, idx) => {
        const sel = idx === selectedIndex;
        return (
          <Box key={idx}>
            <Text color={sel ? "black" : item.isDir ? "yellow" : "gray"} backgroundColor={sel ? "white" : undefined}>
              {sel ? " → " : "   "}{item.isDir ? "▸ " : "  "}{item.label}
            </Text>
          </Box>
        );
      })}
      <Text color="gray" dimColor> ↑↓ select Tab/Enter fill Esc close</Text>
    </Box>
  );
}

function App({ agent, mcpManager, version, resumeChatId }: AppProps) {
  const [input, setInput] = useState("");
  const [showThinking, setShowThinking] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [currentDir, setCurrentDir] = useState(process.cwd());
  // Flag to prevent double-submit when suggestion is executed via Enter
  const suggestionExecutedRef = useRef(false);

  const [needsSetup, setNeedsSetup] = useState(() => {
    const apiKey = configService.getApiKey();
    return !apiKey || apiKey.trim() === "";
  });

  const [menu, setMenu] = useState<MenuMode | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [apikeyInput, setApikeyInput] = useState("");
  const [dynamicModels, setDynamicModels] = useState<ModelInfo[] | null>(null);

  const {
    messages, currentThinking, isProcessing, pendingCount,
    processMessage, stopProcessing, resetMessages, addMessage,
    currentChatId, currentChatName, resumeChat, getChatList,
  } = useMessageProcessing(agent);

  const totalTokens = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / 4;

  useEffect(() => {
    if (resumeChatId) {
      const ok = resumeChat(resumeChatId);
      if (ok) addSystemMessage(`Resumed chat: ${resumeChatId}`);
      else addSystemMessage(`Chat ${resumeChatId} not found`);
    }
  }, []);

  useEffect(() => {
    if (needsSetup && !resumeChatId) {
      addSystemMessage("Welcome to TOD! No API key configured.\nUse /providers to select a provider and set your API key.");
      openProviderMenu();
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(() => { try { setCurrentDir(process.cwd()); } catch { /* */ } }, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const modelName = configService.getModel().split("/").pop() || configService.getModel();
    setTitle(`TOD ${version} · ${modelName}`);
  }, [version]);

  useEffect(() => {
    setSelectedSuggestionIndex(-1);
    if (menu) { setSuggestions([]); return; }
    if (!input.startsWith("/") && !getAtMention(input)) { setSuggestions([]); return; }

    const timer = setTimeout(() => {
      if (input.startsWith("/")) {
        const cmds = getCommandSuggestions(input);
        setSuggestions(cmds.map((c) => ({ type: "command", name: c.name, displayName: formatCommandName(c), description: c.description })));
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
    // Mark that we're handling this Enter — prevents double submit
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

  function openProviderMenu() { setMenu({ type: "provider-select" }); setMenuIndex(0); setApikeyInput(""); }
  function selectProvider(provider: Provider) { setMenu({ type: "provider-apikey", provider }); setApikeyInput(""); }

  function openModelMenu(provider: Provider) {
    setMenu({ type: "model-select", provider }); setMenuIndex(0); setDynamicModels(null);
    const apiKey = configService.getProviderKey(provider.id) || configService.getApiKey();
    if (apiKey) {
      fetchModelsFromAPI(provider.baseURL, apiKey).then((models) => { setDynamicModels(models.length > 0 ? models : null); });
    }
  }

  function selectModel(provider: Provider, model: ModelInfo) {
    configService.setModel(model.id);
    if (model.maxTokens) { const cfg = configService.getConfig(); cfg.maxTokens = model.maxTokens; }
    const newConfig = configService.getConfig();
    agent.updateConfig(newConfig);
    setMenu(null); setDynamicModels(null); setNeedsSetup(false);
    const ctx = model.contextLength ? ` (${Math.round(model.contextLength / 1000)}K ctx)` : "";
    addSystemMessage(`${provider.name} → ${model.name}${ctx}`);
  }

  function closeMenu() { setMenu(null); setMenuIndex(0); setApikeyInput(""); setDynamicModels(null); }

  useInput((inputChar, key) => {
    if (menu) {
      if (key.escape) {
        if (menu.type === "provider-apikey") {
          configService.setProvider(menu.provider.id);
          setMenu({ type: "model-select", provider: menu.provider }); setMenuIndex(0); return;
        }
        closeMenu(); return;
      }
      if (menu.type === "provider-select") {
        if (key.downArrow) { setMenuIndex((prev) => Math.min(prev + 1, providers.length - 1)); return; }
        if (key.upArrow) { setMenuIndex((prev) => Math.max(prev - 1, 0)); return; }
        if (key.return) { selectProvider(providers[menuIndex]); return; }
        return;
      }
      if (menu.type === "provider-apikey") {
        if (key.return) { const key2 = apikeyInput.trim() || undefined; configService.setProvider(menu.provider.id, key2); openModelMenu(menu.provider); return; }
        if (key.backspace || key.delete) { setApikeyInput((prev) => prev.slice(0, -1)); return; }
        if (inputChar && !key.ctrl && !key.meta) { setApikeyInput((prev) => prev + inputChar); return; }
        return;
      }
      if (menu.type === "model-select") {
        const models = dynamicModels || menu.provider.models;
        if (models.length === 0) return;
        if (key.downArrow) { setMenuIndex((prev) => Math.min(prev + 1, models.length - 1)); return; }
        if (key.upArrow) { setMenuIndex((prev) => Math.max(prev - 1, 0)); return; }
        if (key.return) { selectModel(menu.provider, models[menuIndex]); return; }
        return;
      }
      return;
    }

    if (key.escape) {
      if (hasSuggestions) { setSuggestions([]); setSelectedSuggestionIndex(-1); return; }
      if (isProcessing) { agent.abort(); stopProcessing(); return; }
      return;
    }

    if (hasSuggestions && !isProcessing) {
      if (key.downArrow) { setSelectedSuggestionIndex((prev) => prev < 0 ? 0 : Math.min(prev + 1, suggestions.length - 1)); return; }
      if (key.upArrow) { setSelectedSuggestionIndex((prev) => Math.max(prev - 1, -1)); return; }
      if (key.tab) { fillSuggestion(selectedSuggestionIndex >= 0 ? selectedSuggestionIndex : 0); return; }
      if (key.return && selectedSuggestionIndex >= 0) { executeSuggestion(selectedSuggestionIndex); return; }
    }
  });

  // --- Command handling ---
  function handleCommand(rawInput: string) {
    const cmd = matchCommand(rawInput);
    if (!cmd) { addSystemMessage("Unknown command. Type /help for available commands."); return; }

    switch (cmd) {
      case "/provider": case "/providers": openProviderMenu(); break;
      case "/model": case "/models": {
        const providerId = configService.getProvider() || "fireworks";
        const provider = getProvider(providerId);
        if (provider) openModelMenu(provider);
        break;
      }
      case "/thinking":
        setShowThinking((prev) => !prev);
        addSystemMessage(`Thinking display ${!showThinking ? "enabled" : "disabled"}`);
        break;
      case "/clear":
        process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
        resetMessages();
        break;
      case "/compact": handleCompactContext(); break;
      case "/resume": {
        const parts = rawInput.trim().split(/\s+/);
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
            addSystemMessage(`Recent chats:\n${lines.join("\n")}\n\nResume with: /resume <id>`);
          }
        }
        break;
      }
      case "/help": {
        const helpText = commands.map((c) => `  ${formatCommandName(c).padEnd(28)} ${c.description}`).join("\n");
        addSystemMessage(`Commands:\n\n${helpText}`);
        break;
      }
      case "/exit": {
        if (currentChatId && messages.length > 0) {
          console.log(`\n  Resume this chat: tod --resume ${currentChatId}\n`);
        }
        process.exit(0);
      }
      case "/mcp": handleShowMcp(); break;
      default: addSystemMessage(`Unknown command: ${cmd}`);
    }
  }

  const handleCompactContext = async () => {
    addSystemMessage("Compacting context...");
    try {
      const result = await agent.compactContext();
      resetMessages();
      addMessage({ role: "assistant", content: `Context compacted!\nOld: ${result.oldTokens}t → New: ${result.newTokens}t (saved ${Math.round(((result.oldTokens - result.newTokens) / result.oldTokens) * 100)}%)` });
    } catch (error) {
      addSystemMessage(`Failed to compact: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleShowMcp = () => {
    if (!mcpManager) { addSystemMessage("MCP not initialized"); return; }
    const statuses = mcpManager.getStatus();
    if (statuses.length === 0) { addSystemMessage("No MCP servers configured"); return; }
    const lines: string[] = ["MCP Servers:"];
    for (const s of statuses) {
      const icon = s.status === "connected" ? "●" : s.status === "error" ? "✗" : "○";
      lines.push(`  ${icon} ${s.name.padEnd(20)} ${s.status} (${s.toolCount} tools)`);
      if (s.error) lines.push(`      Error: ${s.error}`);
    }
    addSystemMessage(lines.join("\n"));
  };

  const addSystemMessage = (content: string) => { addMessage({ role: "assistant", content }); };

  const handleSubmit = async (value: string) => {
    // If a suggestion was just executed via Enter, skip this submit to avoid double
    if (suggestionExecutedRef.current) {
      suggestionExecutedRef.current = false;
      return;
    }
    if (menu) return;
    setInput(""); setSuggestions([]); setSelectedSuggestionIndex(-1);

    if (value.trim().startsWith("/")) { handleCommand(value.trim()); return; }
    if (needsSetup) { addSystemMessage("No API key configured. Use /providers to select a provider and set your API key."); return; }
    await processMessage(value);
  };

  const modelName = configService.getModel().split("/").pop() || configService.getModel();
  const maxContext = (() => {
    const providerId = configService.getProvider() || "fireworks";
    const modelId = configService.getModel();
    const info = getModelInfo(providerId, modelId);
    return info?.contextLength || 128000;
  })();

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Header version={version} currentDir={currentDir} />
      <MessageList messages={messages} thinking={currentThinking} showThinking={showThinking} />
      <ProviderMenu menu={menu} selectedIndex={menuIndex} apikeyInput={apikeyInput} dynamicModels={dynamicModels} />
      {hasSuggestions && !menu && (
        <SuggestionBar suggestions={suggestions} selectedIndex={selectedSuggestionIndex} onSelect={(idx) => setSelectedSuggestionIndex(idx)} onExecute={executeSuggestion} />
      )}
      {isProcessing && (
        <Box marginTop={1}>
          <WorkingIndicator />
          {pendingCount > 0 && <Text color="yellow"> · {pendingCount} queued</Text>}
        </Box>
      )}
      <InputArea value={input} onChange={menu ? () => {} : setInput} onSubmit={handleSubmit} isProcessing={isProcessing || !!menu} hasPending={pendingCount > 0} needsSetup={needsSetup} />
      <StatusBar modelName={modelName} isProcessing={isProcessing} tokensUsed={totalTokens} maxContext={maxContext} mcpStatus={mcpManager?.getStatusSummary()} />
    </Box>
  );
}

export default App;
