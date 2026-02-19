// ANSI color codes
export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
export const ITALIC = '\x1b[3m';
export const UNDERLINE = '\x1b[4m';

// Foreground colors
export const FG = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

// Background colors
export const BG = {
  black: '\x1b[40m',
  red: '\x1b[41m',
  green: '\x1b[42m',
  yellow: '\x1b[43m',
  blue: '\x1b[44m',
  magenta: '\x1b[45m',
  cyan: '\x1b[46m',
  white: '\x1b[47m',
  gray: '\x1b[100m',
  brightRed: '\x1b[101m',
  brightGreen: '\x1b[102m',
  brightYellow: '\x1b[103m',
  brightBlue: '\x1b[104m',
  brightMagenta: '\x1b[105m',
  brightCyan: '\x1b[106m',
  brightWhite: '\x1b[107m',
};

// Helper functions
export function color(text: string, fg: keyof typeof FG, bg?: keyof typeof BG): string {
  let result = FG[fg] + text + RESET;
  if (bg) {
    result = BG[bg] + FG[fg] + text + RESET;
  }
  return result;
}

export function bold(text: string): string {
  return BOLD + text + RESET;
}

export function dim(text: string): string {
  return DIM + text + RESET;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// Color themes
export const THEME = {
  primary: FG.cyan,
  secondary: FG.magenta,
  success: FG.green,
  warning: FG.yellow,
  error: FG.red,
  info: FG.blue,
  muted: FG.gray,
  user: FG.white,
  assistant: FG.brightWhite,
  system: FG.yellow,
  thinking: FG.gray,
  tool: FG.brightBlue,
  border: FG.cyan,
  selected: BG.cyan + FG.black,
  highlight: BOLD + FG.cyan,
};
