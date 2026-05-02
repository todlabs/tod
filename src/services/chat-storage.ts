import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { logger } from "./logger.js";

export interface ChatFile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatCompletionMessageParam[];
}

function getChatsDir(): string {
  return path.join(os.homedir(), ".tod", "chats");
}

function ensureChatsDir(): void {
  const dir = getChatsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function generateChatId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

export function generateChatName(firstMessage: string): string {
  const clean = firstMessage.replace(/\n/g, " ").trim();
  return clean.length > 50 ? clean.substring(0, 47) + "..." : clean;
}

export function saveChat(chat: ChatFile): void {
  ensureChatsDir();
  const filePath = path.join(getChatsDir(), `${chat.id}.json`);
  try {
    if (fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ChatFile;
        if (existing.createdAt) chat.createdAt = existing.createdAt;
      } catch {
        /* ignore */
      }
    }
    chat.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(chat), "utf-8");
    logger.debug("Chat saved", { id: chat.id });
  } catch (error) {
    logger.error("Failed to save chat", { error });
  }
}

export function loadChat(id: string): ChatFile | null {
  const filePath = path.join(getChatsDir(), `${id}.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ChatFile;
  } catch (error) {
    logger.error("Failed to load chat", { id, error });
    return null;
  }
}

export function listChats(): Array<{ id: string; name: string; updatedAt: string; messageCount: number }> {
  ensureChatsDir();
  const dir = getChatsDir();
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const chats = files
      .map((f) => {
        try {
          const chat = JSON.parse(
            fs.readFileSync(path.join(dir, f), "utf-8"),
          ) as ChatFile;
          return {
            id: chat.id,
            name: chat.name,
            updatedAt: chat.updatedAt,
            messageCount: chat.messages.length,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      updatedAt: string;
      messageCount: number;
    }>;
    // Sort by updatedAt descending
    chats.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return chats;
  } catch {
    return [];
  }
}

export function deleteChat(id: string): boolean {
  const filePath = path.join(getChatsDir(), `${id}.json`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function setCurrentChatId(id: string | null): void {
  ensureChatsDir();
  const filePath = path.join(getChatsDir(), ".current");
  if (id) {
    fs.writeFileSync(filePath, id, "utf-8");
  } else {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
}

export function getCurrentChatId(): string | null {
  const filePath = path.join(getChatsDir(), ".current");
  try {
    if (!fs.existsSync(filePath)) return null;
    const id = fs.readFileSync(filePath, "utf-8").trim();
    return id || null;
  } catch {
    return null;
  }
}
