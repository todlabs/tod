import { EventEmitter } from 'events';
import terminal from 'terminal-kit';
import type { Message, SuggestionItem, MenuState, BackgroundTaskInfo, UIOptions } from './types.js';
import { ROUNDED_BOX } from './types.js';
import { FG, BG, BOLD, DIM, RESET, color, bold, dim, stripAnsi, THEME } from './colors.js';

const term = terminal.terminal;

export class NativeUI extends EventEmitter {
  private messages: Message[] = [];
  private inputLines: string[] = [''];
  private cursorLine = 0;
  private cursorCol = 0;
  private isProcessing = false;
  private spinnerFrame = 0;
  private spinnerTimer?: NodeJS.Timeout;
  private streamingContent = '';
  private isStreaming = false;
  private scrollOffset = 0;
  
  // Autocomplete
  private suggestions: SuggestionItem[] = [];
  private selectedSuggestion = -1;
  private showSuggestions = false;
  
  // Menu
  private menu: MenuState = { type: null };
  private menuIndex = 0;
  private apikeyInput = '';
  
  // Background tasks
  private backgroundTasks: BackgroundTaskInfo[] = [];
  
  // Options
  private options: UIOptions;
  private showThinking: boolean;
  
  // Terminal dimensions
  private width = 80;
  private height = 24;
  
  // Providers for menu
  private providers: Array<{ id: string; name: string; baseURL: string; models: Array<{ id: string; name: string; description: string }> }> = [];

  constructor(options: UIOptions) {
    super();
    this.options = options;
    this.showThinking = options.showThinking ?? true;
    this.updateDimensions();
    this.init();
  }

  private updateDimensions() {
    this.width = term.width || 80;
    this.height = term.height || 24;
  }

  private init() {
    // Clear and setup terminal
    term.clear();
    term.grabInput({ mouse: 'button' });
    term.hideCursor(false);
    
    // Handle keys
    term.on('key', (name: string, _matches: string[], data: any) => {
      this.handleKey(name, data);
    });
    
    // Handle resize
    process.stdout.on('resize', () => {
      this.updateDimensions();
      this.redraw();
    });
    
    // Start spinner animation
    this.startSpinner();
    
    // Initial draw
    this.redraw();
  }

  private startSpinner() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % frames.length;
      if (this.isProcessing) {
        this.drawStatusBar();
      }
    }, 80);
  }

  private handleKey(name: string, data: any) {
    // Ctrl+C always exits
    if (name === 'CTRL_C') {
      this.emit('exit');
      return;
    }

    // Menu mode has priority
    if (this.menu.type) {
      this.handleMenuKey(name, data);
      return;
    }

    // Suggestions mode
    if (this.showSuggestions && this.suggestions.length > 0) {
      if (name === 'UP') {
        this.selectedSuggestion = Math.max(0, this.selectedSuggestion - 1);
        this.drawSuggestions();
        return;
      }
      if (name === 'DOWN') {
        this.selectedSuggestion = Math.min(
          this.suggestions.length - 1,
          this.selectedSuggestion + 1
        );
        this.drawSuggestions();
        return;
      }
      if (name === 'TAB' || (name === 'ENTER' && this.selectedSuggestion >= 0)) {
        this.applySuggestion(this.selectedSuggestion >= 0 ? this.selectedSuggestion : 0);
        return;
      }
      if (name === 'ESCAPE') {
        this.hideSuggestions();
        return;
      }
    }

    // Normal mode
    if (this.isProcessing) {
      // Only allow Ctrl+C (handled above) during processing
      if (name === 'ESCAPE') {
        this.emit('abort');
      }
      return;
    }

    switch (name) {
      case 'ENTER':
        if (!this.showSuggestions) {
          this.submit();
        }
        break;
      case 'BACKSPACE':
        this.deleteChar(-1);
        break;
      case 'DELETE':
        this.deleteChar(0);
        break;
      case 'LEFT':
        this.moveCursor(-1, 0);
        break;
      case 'RIGHT':
        this.moveCursor(1, 0);
        break;
      case 'UP':
        this.moveCursor(0, -1);
        break;
      case 'DOWN':
        this.moveCursor(0, 1);
        break;
      case 'HOME':
        this.cursorCol = 0;
        this.drawInput();
        break;
      case 'END':
        this.cursorCol = this.inputLines[this.cursorLine].length;
        this.drawInput();
        break;
      case 'ESCAPE':
        this.hideSuggestions();
        break;
      case 'TAB':
        // Handled above if suggestions are shown
        break;
      case 'PAGE_UP':
        this.scrollOffset = Math.max(0, this.scrollOffset - 5);
        this.drawMessages();
        break;
      case 'PAGE_DOWN':
        this.scrollOffset += 5;
        this.drawMessages();
        break;
      default:
        if (data?.isCharacter) {
          this.insertChar(String.fromCodePoint(data.codepoint));
        }
    }
  }

  private handleMenuKey(name: string, data: any) {
    if (name === 'ESCAPE') {
      if (this.menu.type === 'provider-apikey') {
        // Skip API key, go to model select
        this.emit('menu-select-provider', this.menu.provider!.id, null);
        return;
      }
      this.closeMenu();
      return;
    }

    if (this.menu.type === 'provider-select') {
      const count = this.providers.length;
      if (name === 'UP') {
        this.menuIndex = Math.max(0, this.menuIndex - 1);
        this.drawMenu();
      } else if (name === 'DOWN') {
        this.menuIndex = Math.min(count - 1, this.menuIndex + 1);
        this.drawMenu();
      } else if (name === 'ENTER') {
        this.emit('menu-select-provider-index', this.menuIndex);
      }
      return;
    }

    if (this.menu.type === 'provider-apikey') {
      if (name === 'ENTER') {
        this.emit('menu-select-provider', this.menu.provider!.id, this.apikeyInput.trim() || null);
      } else if (name === 'BACKSPACE') {
        this.apikeyInput = this.apikeyInput.slice(0, -1);
        this.drawMenu();
      } else if (data?.isCharacter) {
        this.apikeyInput += String.fromCodePoint(data.codepoint);
        this.drawMenu();
      }
      return;
    }

    if (this.menu.type === 'model-select') {
      const models = this.menu.provider?.models || [];
      if (name === 'UP') {
        this.menuIndex = Math.max(0, this.menuIndex - 1);
        this.drawMenu();
      } else if (name === 'DOWN') {
        this.menuIndex = Math.min(models.length - 1, this.menuIndex + 1);
        this.drawMenu();
      } else if (name === 'ENTER') {
        this.emit('menu-select-model', this.menu.provider!.id, models[this.menuIndex].id);
      }
      return;
    }
  }

  private insertChar(char: string) {
    const line = this.inputLines[this.cursorLine];
    const before = line.slice(0, this.cursorCol);
    const after = line.slice(this.cursorCol);
    this.inputLines[this.cursorLine] = before + char + after;
    this.cursorCol++;
    this.drawInput();
    this.updateSuggestions();
  }

  private deleteChar(offset: number) {
    if (offset < 0) {
      // Backspace
      if (this.cursorCol > 0) {
        const line = this.inputLines[this.cursorLine];
        const before = line.slice(0, this.cursorCol - 1);
        const after = line.slice(this.cursorCol);
        this.inputLines[this.cursorLine] = before + after;
        this.cursorCol--;
      } else if (this.cursorLine > 0) {
        // Merge with previous line
        const currentLine = this.inputLines[this.cursorLine];
        this.cursorCol = this.inputLines[this.cursorLine - 1].length;
        this.inputLines[this.cursorLine - 1] += currentLine;
        this.inputLines.splice(this.cursorLine, 1);
        this.cursorLine--;
      }
    } else {
      // Delete key
      const line = this.inputLines[this.cursorLine];
      if (this.cursorCol < line.length) {
        const before = line.slice(0, this.cursorCol);
        const after = line.slice(this.cursorCol + 1);
        this.inputLines[this.cursorLine] = before + after;
      } else if (this.cursorLine < this.inputLines.length - 1) {
        // Merge with next line
        this.inputLines[this.cursorLine] += this.inputLines[this.cursorLine + 1];
        this.inputLines.splice(this.cursorLine + 1, 1);
      }
    }
    this.drawInput();
    this.updateSuggestions();
  }

  private moveCursor(dx: number, dy: number) {
    if (dx !== 0) {
      const newCol = this.cursorCol + dx;
      const lineLength = this.inputLines[this.cursorLine].length;
      if (newCol >= 0 && newCol <= lineLength) {
        this.cursorCol = newCol;
      } else if (dx > 0 && this.cursorLine < this.inputLines.length - 1) {
        this.cursorLine++;
        this.cursorCol = 0;
      } else if (dx < 0 && this.cursorLine > 0) {
        this.cursorLine--;
        this.cursorCol = this.inputLines[this.cursorLine].length;
      }
    }
    if (dy !== 0) {
      const newLine = this.cursorLine + dy;
      if (newLine >= 0 && newLine < this.inputLines.length) {
        this.cursorLine = newLine;
        this.cursorCol = Math.min(this.cursorCol, this.inputLines[this.cursorLine].length);
      } else if (dy > 0) {
        // Add new line when going down on last line
        this.inputLines.push('');
        this.cursorLine = newLine;
        this.cursorCol = 0;
      }
    }
    this.drawInput();
  }

  private submit() {
    const text = this.inputLines.join('\n').trim();
    if (!text) return;
    
    this.emit('submit', text);
    this.addMessage({ role: 'user', content: text });
    
    // Reset input
    this.inputLines = [''];
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.hideSuggestions();
    this.redraw();
  }

  private updateSuggestions() {
    const text = this.inputLines.join('\n');
    const lastLine = this.inputLines[this.cursorLine];
    
    // Check for @ mention
    const atMatch = lastLine.slice(0, this.cursorCol).match(/@([^\s]*)$/);
    if (atMatch) {
      this.emit('file-suggest', atMatch[1]);
      return;
    }
    
    // Check for / command
    if (lastLine.startsWith('/') && this.cursorLine === 0) {
      this.emit('command-suggest', lastLine);
      return;
    }
    
    this.hideSuggestions();
  }

  setSuggestions(suggestions: SuggestionItem[]) {
    this.suggestions = suggestions;
    this.selectedSuggestion = suggestions.length > 0 ? 0 : -1;
    this.showSuggestions = suggestions.length > 0;
    this.drawSuggestions();
  }

  private hideSuggestions() {
    this.showSuggestions = false;
    this.suggestions = [];
    this.selectedSuggestion = -1;
    this.redraw();
  }

  private applySuggestion(index: number) {
    const item = this.suggestions[index];
    if (!item) return;
    
    const lastLine = this.inputLines[this.cursorLine];
    
    if (item.type === 'command') {
      this.inputLines[this.cursorLine] = item.name! + ' ';
      this.cursorCol = this.inputLines[this.cursorLine].length;
    } else if (item.type === 'file') {
      // Replace @query with @path
      const beforeAt = lastLine.slice(0, this.cursorCol).replace(/@[^\s]*$/, '');
      const afterCursor = lastLine.slice(this.cursorCol);
      this.inputLines[this.cursorLine] = beforeAt + '@' + item.path! + afterCursor;
      this.cursorCol = beforeAt.length + 1 + item.path!.length;
    }
    
    this.hideSuggestions();
  }

  // Public API
  addMessage(message: Message) {
    this.messages.push(message);
    this.scrollOffset = 0; // Auto-scroll to bottom
    this.redraw();
  }

  setStreamingContent(content: string) {
    this.streamingContent = content;
    this.isStreaming = true;
    this.redraw();
  }

  endStreaming() {
    if (this.streamingContent) {
      this.messages.push({
        role: 'assistant',
        content: this.streamingContent,
      });
    }
    this.streamingContent = '';
    this.isStreaming = false;
    this.redraw();
  }

  setProcessing(value: boolean) {
    this.isProcessing = value;
    if (!value) {
      this.isStreaming = false;
      this.streamingContent = '';
    }
    this.redraw();
  }

  setBackgroundTasks(tasks: BackgroundTaskInfo[]) {
    this.backgroundTasks = tasks;
    this.drawMessages();
  }

  setMenu(menu: MenuState, index = 0) {
    this.menu = menu;
    this.menuIndex = index;
    this.apikeyInput = '';
    this.redraw();
  }

  closeMenu() {
    this.menu = { type: null };
    this.redraw();
  }

  setProviders(providers: Array<{ id: string; name: string; baseURL: string; models: Array<{ id: string; name: string; description: string }> }>) {
    this.providers = providers;
  }

  clear() {
    this.messages = [];
    this.scrollOffset = 0;
    term.clear();
    this.redraw();
  }

  toggleThinking(): boolean {
    this.showThinking = !this.showThinking;
    this.redraw();
    return this.showThinking;
  }

  // Drawing methods
  private redraw() {
    this.drawHeader();
    this.drawMessages();
    this.drawBackgroundTasks();
    if (this.menu.type) {
      this.drawMenu();
    } else {
      this.drawSuggestions();
      this.drawInput();
    }
    this.drawStatusBar();
  }

  private drawHeader() {
    const cwd = process.cwd();
    const title = `TOD ${this.options.version}`;
    
    term.moveTo(1, 1);
    term.bgCyan().black().bold(title);
    term.bgBlack().dim(' ');
    
    // CWD on the right
    const cwdText = cwd.length > this.width - title.length - 5 
      ? '...' + cwd.slice(-(this.width - title.length - 8))
      : cwd;
    term.moveTo(this.width - cwdText.length, 1);
    term.dim(cwdText);
    
    // Separator line
    term.moveTo(1, 2);
    term.cyan(ROUNDED_BOX.horizontal.repeat(this.width));
  }

  private drawMessages() {
    const startY = 3;
    const inputAreaHeight = this.getInputAreaHeight();
    const tasksHeight = Math.min(this.backgroundTasks.filter(t => t.status === 'running').length, 3);
    const endY = this.height - inputAreaHeight - tasksHeight - 2;
    
    // Clear message area
    for (let y = startY; y <= endY; y++) {
      term.moveTo(1, y);
      term.eraseLine();
    }
    
    // Collect all display messages
    const displayMessages: Message[] = [];
    for (const msg of this.messages) {
      if (msg.isThinking && !this.showThinking) continue;
      displayMessages.push(msg);
    }
    
    // Add streaming content as virtual message
    if (this.isStreaming && this.streamingContent) {
      displayMessages.push({
        role: 'assistant',
        content: this.streamingContent,
      });
    }
    
    // Calculate visible range
    const visibleHeight = endY - startY + 1;
    const totalLines = this.calculateTotalLines(displayMessages);
    
    // Auto-scroll if at bottom
    if (this.scrollOffset === 0 && totalLines > visibleHeight) {
      this.scrollOffset = totalLines - visibleHeight;
    }
    
    // Render messages
    let currentY = endY;
    let remainingLines = visibleHeight;
    
    for (let i = displayMessages.length - 1; i >= 0 && remainingLines > 0; i--) {
      const msg = displayMessages[i];
      const lines = this.formatMessage(msg);
      
      for (let j = lines.length - 1; j >= 0 && remainingLines > 0; j--) {
        term.moveTo(1, currentY);
        term(lines[j]);
        currentY--;
        remainingLines--;
      }
      
      // Add spacing between messages
      if (remainingLines > 0) {
        currentY--;
        remainingLines--;
      }
    }
  }

  private calculateTotalLines(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.formatMessage(msg).length + 1; // +1 for spacing
    }
    return total;
  }

  private formatMessage(msg: Message): string[] {
    const maxWidth = this.width - 4;
    
    if (msg.role === 'user') {
      const prefix = `${THEME.muted}▸ ${THEME.user}`;
      const lines = this.wrapText(msg.content, maxWidth - 2);
      return lines.map((line, i) => 
        i === 0 ? `${prefix}${line}${RESET}` : `  ${THEME.user}${line}${RESET}`
      );
    }
    
    if (msg.role === 'assistant' && msg.isThinking) {
      const prefix = `${THEME.thinking}◈ Thinking${RESET}`;
      const content = msg.content.length > 400 ? msg.content.slice(0, 400) + '...' : msg.content;
      const lines = this.wrapText(content, maxWidth - 2);
      return [prefix, ...lines.map(l => `${THEME.thinking}  ${l}${RESET}`)];
    }
    
    if (msg.role === 'assistant') {
      const lines = this.wrapText(msg.content, maxWidth);
      return lines.map(line => `${THEME.assistant}${line}${RESET}`);
    }
    
    if (msg.role === 'system') {
      const prefix = `${THEME.system}● ${RESET}`;
      const lines = this.wrapText(msg.content, maxWidth - 2);
      return lines.map((line, i) => 
        i === 0 ? `${prefix}${THEME.system}${line}${RESET}` : `  ${THEME.system}${line}${RESET}`
      );
    }
    
    if (msg.role === 'tool') {
      const prefix = `${THEME.tool}→ ${msg.toolName || 'tool'}${RESET}`;
      const content = msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '');
      const lines = this.wrapText(content, maxWidth - 4);
      return [
        prefix,
        ...lines.map(l => `    ${THEME.muted}${l}${RESET}`)
      ];
    }
    
    return [];
  }

  private wrapText(text: string, width: number): string[] {
    if (!text) return [''];
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    
    for (const para of paragraphs) {
      if (!para.trim()) {
        lines.push('');
        continue;
      }
      
      let current = '';
      for (const word of para.split(' ')) {
        const wordWidth = stripAnsi(word).length;
        const currentWidth = stripAnsi(current).length;
        
        if (currentWidth + wordWidth + 1 > width && current) {
          lines.push(current.trim());
          current = word + ' ';
        } else {
          current += word + ' ';
        }
      }
      if (current.trim()) {
        lines.push(current.trim());
      }
    }
    
    return lines.length ? lines : [''];
  }

  private drawBackgroundTasks() {
    const inputAreaHeight = this.getInputAreaHeight();
    const runningTasks = this.backgroundTasks.filter(t => t.status === 'running');
    const tasksHeight = Math.min(runningTasks.length, 3);
    const startY = this.height - inputAreaHeight - tasksHeight - 1;
    
    // Clear area
    for (let y = startY; y < this.height - inputAreaHeight - 1; y++) {
      term.moveTo(1, y);
      term.eraseLine();
    }
    
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinner = frames[this.spinnerFrame];
    
    let y = startY;
    for (const task of runningTasks.slice(0, 3)) {
      term.moveTo(1, y);
      term(`${THEME.primary}${spinner}${RESET} ${BOLD}${task.name}${RESET} ${THEME.muted}[${task.activity || 'working'}]${RESET}`);
      y++;
    }
  }

  private drawInput() {
    const y = this.height - 2;
    const prompt = '→ ';
    
    // Clear input area
    term.moveTo(1, y);
    term.eraseLine();
    
    // Draw border top
    term.moveTo(1, y - 1);
    term.eraseLine();
    term(`${ROUNDED_BOX.tRight}${ROUNDED_BOX.horizontal.repeat(this.width - 2)}${ROUNDED_BOX.tLeft}`);
    
    // Draw input content
    term.moveTo(1, y);
    term(`${FG.white}${prompt}${RESET}`);
    
    // Draw each line of input
    const inputY = y;
    for (let i = 0; i < this.inputLines.length; i++) {
      if (i > 0) {
        term.moveTo(1, inputY + i);
        term('  '); // Indent continuation lines
      }
      term(this.inputLines[i]);
    }
    
    // Position cursor
    const cursorX = 1 + prompt.length + this.cursorCol;
    const cursorY = inputY + this.cursorLine;
    term.moveTo(cursorX, cursorY);
  }

  private drawSuggestions() {
    if (!this.showSuggestions || this.suggestions.length === 0) return;
    
    const inputY = this.height - 2;
    const maxSuggestions = Math.min(this.suggestions.length, 8);
    const startY = inputY - maxSuggestions - 2;
    
    // Clear area
    for (let y = startY; y < inputY - 1; y++) {
      term.moveTo(1, y);
      term.eraseLine();
    }
    
    // Draw suggestions
    let y = startY;
    for (let i = 0; i < maxSuggestions; i++) {
      const item = this.suggestions[i];
      const isSelected = i === this.selectedSuggestion;
      
      term.moveTo(1, y);
      
      if (item.type === 'command') {
        if (isSelected) {
          term(`${BG.cyan}${FG.black} ▶ ${item.name!.padEnd(16)} ${item.description}${RESET}`);
        } else {
          term(`  ${THEME.primary}${item.name!.padEnd(16)}${RESET} ${THEME.muted}${item.description}${RESET}`);
        }
      } else {
        const icon = item.isDir ? 'dir ' : 'file';
        const color = item.isDir ? FG.yellow : FG.white;
        if (isSelected) {
          term(`${BG.cyan}${FG.black} ▶ ${icon} ${item.label}${RESET}`);
        } else {
          term(`  ${color}${icon}${RESET} ${item.label}`);
        }
      }
      y++;
    }
    
    // Draw hint
    term.moveTo(1, y);
    term(`${THEME.muted}   ↑↓ navigate  Tab/Enter select  Esc cancel${RESET}`);
  }

  private drawMenu() {
    if (!this.menu.type) return;
    
    const centerY = Math.floor(this.height / 2) - 5;
    const boxWidth = Math.min(60, this.width - 4);
    const startX = Math.floor((this.width - boxWidth) / 2);
    
    // Clear area for menu
    for (let y = centerY - 1; y < centerY + 15; y++) {
      if (y > 2 && y < this.height - 2) {
        term.moveTo(1, y);
        term.eraseLine();
      }
    }
    
    if (this.menu.type === 'provider-select') {
      this.drawProviderMenu(startX, centerY, boxWidth);
    } else if (this.menu.type === 'provider-apikey') {
      this.drawApiKeyMenu(startX, centerY, boxWidth);
    } else if (this.menu.type === 'model-select') {
      this.drawModelMenu(startX, centerY, boxWidth);
    }
  }

  private drawProviderMenu(x: number, y: number, width: number) {
    const count = this.providers.length;
    this.drawBox(x, y, width, count + 4, 'Select Provider');
    
    let row = y + 2;
    for (let i = 0; i < count; i++) {
      const p = this.providers[i];
      const isSelected = i === this.menuIndex;
      term.moveTo(x + 2, row);
      if (isSelected) {
        term(`${BG.cyan}${FG.black} > ${p.name.padEnd(16)} ${p.baseURL}${RESET}`);
      } else {
        term(`  ${THEME.primary}${p.name.padEnd(16)}${RESET} ${THEME.muted}${p.baseURL}${RESET}`);
      }
      row++;
    }
    
    term.moveTo(x + 2, y + count + 3);
    term(`${THEME.muted}↑↓ navigate  Enter select  Esc cancel${RESET}`);
  }

  private drawApiKeyMenu(x: number, y: number, width: number) {
    const provider = this.menu.provider;
    this.drawBox(x, y, width, 7, `API Key for ${provider?.name}`);
    
    term.moveTo(x + 2, y + 3);
    term(`${THEME.muted}Key: ${RESET}${this.apikeyInput}${THEME.muted}█${RESET}`);
    
    term.moveTo(x + 2, y + 5);
    term(`${THEME.muted}Enter confirm  Esc skip${RESET}`);
  }

  private drawModelMenu(x: number, y: number, width: number) {
    const models = this.menu.provider?.models || [];
    this.drawBox(x, y, width, Math.min(models.length + 4, 12), `Select Model — ${this.menu.provider?.name}`);
    
    let row = y + 2;
    const visibleCount = Math.min(models.length, 8);
    for (let i = 0; i < visibleCount; i++) {
      const m = models[i];
      const isSelected = i === this.menuIndex;
      term.moveTo(x + 2, row);
      if (isSelected) {
        term(`${BG.cyan}${FG.black} > ${m.name.padEnd(24)} ${m.description}${RESET}`);
      } else {
        term(`  ${BOLD}${m.name.padEnd(24)}${RESET} ${THEME.muted}${m.description}${RESET}`);
      }
      row++;
    }
    
    term.moveTo(x + 2, y + visibleCount + 3);
    term(`${THEME.muted}↑↓ navigate  Enter select  Esc cancel${RESET}`);
  }

  private drawBox(x: number, y: number, width: number, height: number, title: string) {
    // Top border
    term.moveTo(x, y);
    term(`${ROUNDED_BOX.topLeft}${ROUNDED_BOX.horizontal.repeat(width - 2)}${ROUNDED_BOX.topRight}`);
    
    // Title
    if (title) {
      term.moveTo(x + 3, y);
      term(` ${title} `);
    }
    
    // Side borders
    for (let i = 1; i < height - 1; i++) {
      term.moveTo(x, y + i);
      term(ROUNDED_BOX.vertical);
      term.moveTo(x + width - 1, y + i);
      term(ROUNDED_BOX.vertical);
    }
    
    // Bottom border
    term.moveTo(x, y + height - 1);
    term(`${ROUNDED_BOX.bottomLeft}${ROUNDED_BOX.horizontal.repeat(width - 2)}${ROUNDED_BOX.bottomRight}`);
  }

  private drawStatusBar() {
    const y = this.height;
    
    term.moveTo(1, y);
    term.eraseLine();
    
    // Left side - status
    if (this.isProcessing) {
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      const spinner = frames[this.spinnerFrame];
      term(`${THEME.primary}${spinner}${RESET} ${THEME.muted}thinking...${RESET}`);
    } else {
      term(`${THEME.success}●${RESET} ${THEME.muted}ready${RESET}`);
    }
    
    // Right side - token count
    const tokens = Math.round(this.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    const tokenText = `${tokens}t`;
    term.moveTo(this.width - tokenText.length, y);
    term(`${THEME.muted}${tokenText}${RESET}`);
  }

  private getInputAreaHeight(): number {
    return Math.max(2, this.inputLines.length + 1);
  }

  destroy() {
    clearInterval(this.spinnerTimer);
    term.grabInput(false);
    term.styleReset();
    term('\n\n');
  }
}
