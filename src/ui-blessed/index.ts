import blessed from 'neo-blessed';
import { EventEmitter } from 'events';

export class BlessedUI extends EventEmitter {
  private screen: blessed.Widgets.Screen;
  private chatBox: blessed.Widgets.Log;
  private inputBox: blessed.Widgets.Textbox;
  private statusBar: blessed.Widgets.Box;
  private header: blessed.Widgets.Box;
  private suggestionBox: blessed.Widgets.List;
  
  private messages: Array<{ role: string; content: string }> = [];
  private isProcessing = false;
  private spinnerFrame = 0;
  private spinnerTimer?: NodeJS.Timeout;
  private suggestions: string[] = [];
  private suggestionType: 'command' | 'file' | null = null;

  constructor(private version: string) {
    super();
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'TOD',
      cursor: { artificial: true, shape: 'block' },
    });

    this.createWidgets();
    this.setupEvents();
    this.startSpinner();
  }

  private createWidgets() {
    // Header
    this.header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 2,
      style: { fg: 'cyan', bg: 'default' },
      tags: true,
    });
    this.updateHeader();

    // Chat box (основная область сообщений)
    this.chatBox = blessed.log({
      top: 2,
      left: 0,
      width: '100%',
      height: '100%-4',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: '│', style: { fg: 'cyan' } },
      style: { fg: 'white', bg: 'default' },
      tags: true,
      wrap: true,
    });

    // Suggestion box (для подсказок / и @)
    this.suggestionBox = blessed.list({
      top: '50%',
      left: 'center',
      width: 50,
      height: 10,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        fg: 'white',
        bg: 'default',
        selected: { fg: 'black', bg: 'cyan' },
      },
      tags: true,
      hidden: true,
      keys: true,
      vi: false,
    });

    // Input box
    this.inputBox = blessed.textbox({
      bottom: 1,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 'white', bg: 'default' },
      inputOnFocus: true,
      tags: true,
    });

    // Status bar
    this.statusBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 'gray', bg: 'default' },
      tags: true,
    });

    // Добавляем виджеты на экран
    this.screen.append(this.header);
    this.screen.append(this.chatBox);
    this.screen.append(this.suggestionBox);
    this.screen.append(this.inputBox);
    this.screen.append(this.statusBar);

    // Фокус на ввод
    this.inputBox.focus();
  }

  private setupEvents() {
    // Выход
    this.screen.key(['escape', 'C-c'], () => {
      this.emit('exit');
    });

    // Отправка сообщения
    this.inputBox.key('enter', () => {
      const text = this.inputBox.getValue().trim();
      if (!text) return;

      // Скрываем подсказки
      this.hideSuggestions();

      // Добавляем сообщение пользователя
      this.addMessage('user', text);
      
      // Очищаем ввод
      this.inputBox.setValue('');
      this.screen.render();

      // Отправляем событие
      this.emit('submit', text);
    });

    // Навигация по подсказкам
    this.inputBox.key(['up', 'down', 'tab'], (_ch: any, key: { name: string }) => {
      if (!this.suggestionBox.hidden && this.suggestions.length > 0) {
        if (key.name === 'up') {
          this.suggestionBox.up();
          this.screen.render();
          return;
        }
        if (key.name === 'down') {
          this.suggestionBox.down();
          this.screen.render();
          return;
        }
        if (key.name === 'tab' || key.name === 'enter') {
          const selected = this.suggestionBox.getItem(this.suggestionBox.selected);
          if (selected) {
            const content = selected.getContent().replace(/\{[^}]+\}/g, '');
            this.applySuggestion(content);
          }
          return;
        }
      }
    });

    // Отмена подсказок
    this.inputBox.key('escape', () => {
      this.hideSuggestions();
    });

    // Обработка ввода для подсказок
    this.inputBox.on('keypress', () => {
      setTimeout(() => this.updateSuggestions(), 10);
    });

    // Выбор из списка подсказок
    this.suggestionBox.on('select', (item: blessed.Widgets.BlessedElement) => {
      const content = item.getContent().replace(/\{[^}]+\}/g, '');
      this.applySuggestion(content);
    });

    // Фокус всегда на вводе
    this.chatBox.on('click', () => {
      this.inputBox.focus();
    });
  }

  private updateSuggestions() {
    const text = this.inputBox.getValue();
    
    // Подсказки команд
    if (text.startsWith('/')) {
      const commands = [
        { name: '/clear', desc: 'Clear chat' },
        { name: '/exit', desc: 'Exit TOD' },
        { name: '/help', desc: 'Show help' },
        { name: '/providers', desc: 'Select provider' },
        { name: '/models', desc: 'Select model' },
        { name: '/tasks', desc: 'Show background tasks' },
        { name: '/mcp', desc: 'Show MCP servers' },
        { name: '/compact', desc: 'Compact context' },
        { name: '/thinking', desc: 'Toggle thinking' },
      ];
      
      const query = text.slice(1).toLowerCase();
      const matches = commands.filter(c => 
        c.name.includes(query) || c.desc.toLowerCase().includes(query)
      );
      
      if (matches.length > 0 && text.length > 0) {
        this.showSuggestions(matches.map(c => `{cyan-fg}${c.name}{/cyan-fg} {gray-fg}${c.desc}{/gray-fg}`));
        this.suggestionType = 'command';
      } else {
        this.hideSuggestions();
      }
      return;
    }

    // Подсказки файлов (@)
    const atMatch = text.match(/@([^\s]*)$/);
    if (atMatch) {
      // Показываем placeholder для файлов
      this.showSuggestions([
        '{gray-fg}Type to search files...{/gray-fg}',
      ]);
      this.suggestionType = 'file';
      this.emit('file-suggest', atMatch[1]);
      return;
    }

    this.hideSuggestions();
  }

  showFileSuggestions(files: string[]) {
    if (this.suggestionType === 'file') {
      if (files.length === 0) {
        this.hideSuggestions();
        return;
      }
      this.showSuggestions(files.map(f => 
        f.endsWith('/') 
          ? `{yellow-fg}📁 ${f}{/yellow-fg}` 
          : `📄 ${f}`
      ));
    }
  }

  private showSuggestions(items: string[]) {
    this.suggestions = items;
    this.suggestionBox.setItems(items);
    this.suggestionBox.show();
    this.suggestionBox.select(0);
    this.screen.render();
  }

  private hideSuggestions() {
    this.suggestionBox.hide();
    this.suggestionType = null;
    this.screen.render();
  }

  private applySuggestion(content: string) {
    const current = this.inputBox.getValue();
    
    if (this.suggestionType === 'command') {
      // Извлекаем имя команды
      const cmdName = content.match(/\{cyan-fg\}([^}]+)\{\/cyan-fg\}/)?.[1] || content.split(' ')[0];
      this.inputBox.setValue(cmdName + ' ');
    } else if (this.suggestionType === 'file') {
      // Заменяем @query на @filepath
      const newValue = current.replace(/@[^\s]*$/, '@' + content.replace(/[📁📄] /g, ''));
      this.inputBox.setValue(newValue);
    }
    
    this.hideSuggestions();
    this.inputBox.focus();
    this.screen.render();
  }

  private updateHeader() {
    const cwd = process.cwd();
    this.header.setContent(`{cyan-fg}{bold}TOD{/bold}{/cyan-fg} v${this.version} {right}{gray-fg}${cwd}{/gray-fg}{/right}`);
  }

  addMessage(role: string, content: string) {
    this.messages.push({ role, content });
    
    if (role === 'user') {
      this.chatBox.log(`{cyan-fg}> {/cyan-fg}${content}`);
    } else if (role === 'assistant') {
      // Убираем markdown-like символы для blessed
      const cleanContent = content
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .replace(/\n/g, '\n  ');
      this.chatBox.log(`  ${cleanContent}`);
    } else if (role === 'system') {
      this.chatBox.log(`{gray-fg}  ${content}{/gray-fg}`);
    } else if (role === 'thinking') {
      this.chatBox.log(`{gray-fg}  [thinking] ${content}{/gray-fg}`);
    }

    this.chatBox.setScrollPerc(100);
    this.screen.render();
  }

  setProcessing(processing: boolean) {
    this.isProcessing = processing;
    this.updateStatus();
  }

  private startSpinner() {
    const frames = ['|', '/', '-', '\\'];
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % frames.length;
      this.updateStatus();
    }, 100);
  }

  private updateStatus() {
    const tokens = Math.round(this.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    
    if (this.isProcessing) {
      const frames = ['|', '/', '-', '\\'];
      this.statusBar.setContent(`{cyan-fg}${frames[this.spinnerFrame]}{/cyan-fg} {gray-fg}thinking...{/gray-fg}{right}{gray-fg}${tokens}t{/gray-fg}{/right}`);
    } else {
      this.statusBar.setContent(`{gray-fg}ready{/gray-fg}{right}{gray-fg}${tokens}t{/gray-fg}{/right}`);
    }
    
    this.screen.render();
  }

  clear() {
    this.chatBox.setContent('');
    this.messages = [];
    this.screen.render();
  }

  destroy() {
    clearInterval(this.spinnerTimer);
    this.screen.destroy();
  }
}
