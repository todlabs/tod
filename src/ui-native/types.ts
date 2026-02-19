export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  isThinking?: boolean;
  thinkingTime?: number;
  toolName?: string;
}

export interface SuggestionItem {
  type: 'command' | 'file';
  name?: string;
  description?: string;
  path?: string;
  isDir?: boolean;
  label?: string;
}

export interface MenuState {
  type: 'provider-select' | 'provider-apikey' | 'model-select' | null;
  provider?: { id: string; name: string; baseURL: string; models: Array<{ id: string; name: string; description: string }> };
}

export interface UIOptions {
  version: string;
  showThinking?: boolean;
}

export interface BackgroundTaskInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  activity?: string;
}

export interface BoxChars {
  horizontal: string;
  vertical: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  cross: string;
  tDown: string;
  tUp: string;
  tRight: string;
  tLeft: string;
}

export const ROUNDED_BOX: BoxChars = {
  horizontal: '─',
  vertical: '│',
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  cross: '┼',
  tDown: '┬',
  tUp: '┴',
  tRight: '├',
  tLeft: '┤',
};

export const DOUBLE_BOX: BoxChars = {
  horizontal: '═',
  vertical: '║',
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  cross: '╬',
  tDown: '╦',
  tUp: '╩',
  tRight: '╠',
  tLeft: '╣',
};
