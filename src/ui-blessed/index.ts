import blessed from 'neo-blessed';
import { EventEmitter } from 'events';

// Цвета TOD
const C = {
  cyan: '\x1b[36m',
  black: '\x1b[30m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
  bgCyan: '\x1b[46m',
};

export class BlessedUI extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private chat: blessed.Widgets.Box;
  private input: blessed.Widgets.Textbox;
  private status: blessed.Widgets.Box;
  private header: blessed.Widgets.Box;
  private popup: blessed.Widgets.List;
  
  private lines: string[] = [];
  private isProcessing = false;
  private spinnerFrame = 0;
  private spinnerTimer?: NodeJS.Timeout;
  private popupType: 'command' | 'file' | null = null;

  constructor(private version: string) {
    super();
    
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'TOD',
      terminal: 'windows-ansi',
    });

    this.createUI();
    this.bindKeys();
    this.startSpinner();
  }

  private createUI() {
    // Header
    this.header = blessed.box({
      top: 0, left: 0, width: '100%', height: 1,
      style: { fg: 'cyan', bg: 'default' },
    });

    // Chat area
    this.chat = blessed.box({
      top: 1, left: 0, 
      width: '100%', height: '100%-3',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: '│', style: { fg: 'cyan' } },
      style: { fg: 'white' },
      tags: false,
    });

    // Popup для подсказок
    this.popup = blessed.list({
      top: 'center', left: 'center',
      width: 50, height: 12,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        fg: 'white',
        selected: { fg: 'black', bg: 'cyan' },
      },
      hidden: true,
      keys: true,
    });

    // Input
    this.input = blessed.textbox({
      bottom: 1, left: 0, width: '100%', height: 1,
      style: { fg: 'white' },
      inputOnFocus: true,
    });

    // Status bar
    this.status = blessed.box({
      bottom: 0, left: 0, width: '100%', height: 1,
      style: { fg: 'gray' },
    });

    this.screen.append(this.header);
    this.screen.append(this.chat);
    this.screen.append(this.popup);
    this.screen.append(this.input);
    this.screen.append(this.status);

    this.input.focus();
    this.updateHeader();
  }

  private bindKeys() {
    this.screen.key(['C-c', 'escape'], () => this.emit('exit'));

    // Enter - отправка
    this.input.key('enter', () => {
      const text = this.input.getValue().trim();
      if (!text) return;
      
      this.hidePopup();
      this.addUserLine(text);
      this.input.setValue('');
      this.emit('submit', text);
      this.render();
    });

    // Навигация по подсказкам
    this.input.key(['up', 'down', 'tab'], (_: any, key: { name: string }) => {
      if (this.popup.hidden) return;
      
      if (key.name === 'up') {
        this.popup.up();
      } else if (key.name === 'down') {
        this.popup.down();
      } else if (key.name === 'tab') {
        this.selectPopupItem();
      }
      this.render();
    });

    // Escape - закрыть подсказки
    this.input.key('escape', () => {
      this.hidePopup();
    });

    // Обновление подсказок при вводе
    this.input.on('keypress', () => {
      setTimeout(() => this.checkSuggestions(), 5);
    });

    // Клик по popup
    this.popup.on('select', () => this.selectPopupItem());
    this.popup.on('action', () => this.selectPopupItem());
  }

  private checkSuggestions() {
    const text = this.input.getValue();
    
    if (text.startsWith('/')) {
      const cmds = [
        '/clear', '/exit', '/help', '/providers', 
        '/models', '/tasks', '/mcp', '/compact', '/thinking'
      ].filter(c => c.startsWith(text));
      
      if (cmds.length && text.length > 0) {
        this.showPopup(cmds, 'command');
      } else {
        this.hidePopup();
      }
      return;
    }

    const atMatch = text.match(/@([^\s]*)$/);
    if (atMatch) {
      this.popupType = 'file';
      this.emit('file-suggest', atMatch[1]);
      return;
    }

    this.hidePopup();
  }

  showFileSuggestions(files: string[]) {
    if (!this.popupType) return;
    if (files.length === 0) {
      this.hidePopup();
      return;
    }
    this.showPopup(files.slice(0, 10), 'file');
  }

  private showPopup(items: string[], type: 'command' | 'file') {
    this.popupType = type;
    this.popup.setItems(items);
    this.popup.show();
    this.popup.select(0);
    this.render();
  }

  private hidePopup() {
    this.popupType = null;
    this.popup.hide();
    this.input.focus();
    this.render();
  }

  private selectPopupItem() {
    const item = this.popup.getItem(this.popup.selected);
    if (!item) return;
    
    const content = item.getContent();
    const current = this.input.getValue();
    
    if (this.popupType === 'command') {
      this.input.setValue(content + ' ');
    } else {
      this.input.setValue(current.replace(/@[^\s]*$/, '@' + content));
    }
    
    this.hidePopup();
  }

  private updateHeader() {
    const cwd = process.cwd().slice(-50); // обрезаем длинный путь
    const left = `${C.cyan}TOD${C.reset} v${this.version}`;
    const right = `${C.gray}${cwd}${C.reset}`;
    const spaces = ' '.repeat(Math.max(1, this.screen.width - left.length - right.length + 10));
    
    this.header.setContent(left + spaces + right);
  }

  addUserLine(text: string) {
    this.lines.push(`${C.cyan}> ${C.reset}${text}`);
    this.refreshChat();
  }

  addAssistantLine(text: string) {
    // Убираем markdown
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/`/g, '');
    
    // Переносим длинные строки
    const wrapped = this.wrapText(clean, this.screen.width - 4);
    
    for (const line of wrapped) {
      this.lines.push(`  ${line}`);
    }
    this.refreshChat();
  }

  addSystemLine(text: string) {
    this.lines.push(`${C.gray}  ${text}${C.reset}`);
    this.refreshChat();
  }

  addMessage(role: string, content: string) {
    if (role === 'user') {
      this.addUserLine(content);
    } else if (role === 'assistant') {
      this.addAssistantLine(content);
    } else {
      this.addSystemLine(content);
    }
  }

  // Для потокового вывода
  setStreamingContent(content: string) {
    // Удаляем предыдущую временную строку если есть
    if (this.lines.length > 0 && this.lines[this.lines.length - 1].startsWith('\x1b[90m  [streaming]')) {
      this.lines.pop();
    }
    // Добавляем временную строку
    const preview = content.slice(-200).replace(/\n/g, ' ');
    this.lines.push(`${C.gray}  [streaming] ${preview}${C.reset}`);
    this.refreshChat();
  }

  endStreaming() {
    // Удаляем временную строку
    if (this.lines.length > 0 && this.lines[this.lines.length - 1].startsWith('\x1b[90m  [streaming]')) {
      this.lines.pop();
      this.refreshChat();
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (!text) return [];
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    
    for (const para of paragraphs) {
      if (para.length <= maxWidth) {
        lines.push(para);
        continue;
      }
      
      let current = '';
      for (const word of para.split(' ')) {
        if ((current + word).length > maxWidth) {
          lines.push(current.trim());
          current = word + ' ';
        } else {
          current += word + ' ';
        }
      }
      if (current.trim()) lines.push(current.trim());
    }
    
    return lines;
  }

  private refreshChat() {
    // Показываем последние N строк
    const height = this.screen.height - 4;
    const visible = this.lines.slice(-height);
    this.chat.setContent(visible.join('\n'));
    this.chat.setScrollPerc(100);
    this.render();
  }

  setProcessing(value: boolean) {
    this.isProcessing = value;
    this.updateStatus();
  }

  private startSpinner() {
    const frames = ['◐', '◓', '◑', '◒'];
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % frames.length;
      this.updateStatus();
    }, 100);
  }

  private updateStatus() {
    const tokens = Math.round(this.lines.join('').length / 4);
    const frame = ['◐', '◓', '◑', '◒'][this.spinnerFrame];
    
    const left = this.isProcessing 
      ? `${C.cyan}${frame}${C.reset} thinking...`
      : `${C.gray}ready${C.reset}`;
    
    const right = `${C.gray}${tokens}t${C.reset}`;
    const spaces = ' '.repeat(Math.max(1, this.screen.width - 15));
    
    this.status.setContent(left + spaces + right);
    this.render();
  }

  clear() {
    this.lines = [];
    this.chat.setContent('');
    this.render();
  }

  private render() {
    this.screen.render();
  }

  destroy() {
    clearInterval(this.spinnerTimer);
    this.screen.destroy();
  }
}
