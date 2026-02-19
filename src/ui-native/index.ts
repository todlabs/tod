import terminal from 'terminal-kit';
import { EventEmitter } from 'events';

const term = terminal.terminal;

export class NativeUI extends EventEmitter {
  private messages: Array<{ role: string; content: string }> = [];
  private inputBuffer = '';
  private cursorPos = 0;
  private isProcessing = false;
  private spinnerFrame = 0;
  private spinnerTimer?: NodeJS.Timeout;

  constructor(private version: string) {
    super();
    this.init();
  }

  private init() {
    term.clear();
    term.grabInput({ mouse: 'button' });

    term.on('key', (name: string, _matches: string[], data: any) => {
      this.handleKey(name, data);
    });

    this.startSpinner();
    this.draw();
  }

  private handleKey(name: string, data: any) {
    if (name === 'CTRL_C') {
      this.emit('exit');
      return;
    }

    if (this.isProcessing) return;

    switch (name) {
      case 'ENTER':
        this.submit();
        break;
      case 'BACKSPACE':
        this.deleteChar(-1);
        break;
      case 'DELETE':
        this.deleteChar(0);
        break;
      case 'LEFT':
        this.moveCursor(-1);
        break;
      case 'RIGHT':
        this.moveCursor(1);
        break;
      case 'HOME':
        this.cursorPos = 0;
        this.drawInput();
        break;
      case 'END':
        this.cursorPos = this.inputBuffer.length;
        this.drawInput();
        break;
      default:
        if (data?.isCharacter) {
          this.insertChar(data.codepoint);
        }
    }
  }

  private insertChar(codepoint: number) {
    const char = String.fromCodePoint(codepoint);
    const before = this.inputBuffer.slice(0, this.cursorPos);
    const after = this.inputBuffer.slice(this.cursorPos);
    this.inputBuffer = before + char + after;
    this.cursorPos++;
    this.drawInput();
  }

  private deleteChar(offset: number) {
    const pos = this.cursorPos + offset;
    if (pos < 0 || pos >= this.inputBuffer.length + offset) return;
    
    const before = this.inputBuffer.slice(0, pos);
    const after = this.inputBuffer.slice(pos + (offset === 0 ? 1 : 0));
    this.inputBuffer = before + after;
    if (offset < 0) this.cursorPos--;
    this.drawInput();
  }

  private moveCursor(delta: number) {
    const newPos = this.cursorPos + delta;
    if (newPos < 0 || newPos > this.inputBuffer.length) return;
    this.cursorPos = newPos;
    this.drawInput();
  }

  private submit() {
    const text = this.inputBuffer.trim();
    if (!text) return;
    
    this.emit('submit', text);
    this.addMessage('user', text);
    this.inputBuffer = '';
    this.cursorPos = 0;
    this.draw();
  }

  private startSpinner() {
    const frames = ['|', '/', '-', '\\'];
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % frames.length;
      if (this.isProcessing) this.drawStatus();
    }, 100);
  }

  addMessage(role: string, content: string) {
    this.messages.push({ role, content });
    this.draw();
  }

  setProcessing(value: boolean) {
    this.isProcessing = value;
    this.drawStatus();
  }

  private draw() {
    this.drawHeader();
    this.drawMessages();
    this.drawInput();
    this.drawStatus();
  }

  private drawHeader() {
    term.moveTo(1, 1);
    term.cyan.bold('TOD');
    term.gray(` v${this.version}`);
    
    const cwd = process.cwd();
    const cwdX = term.width - cwd.length;
    term.moveTo(cwdX, 1);
    term.gray.dim(cwd);
    
    term.moveTo(1, 2);
    term.cyan('─'.repeat(term.width));
  }

  private drawMessages() {
    const startY = 3;
    const endY = term.height - 3;
    const visibleCount = endY - startY;
    
    // Очищаем область сообщений
    for (let y = startY; y <= endY; y++) {
      term.moveTo(1, y);
      term.eraseLine();
    }
    
    const toShow = this.messages.slice(-visibleCount);
    let y = startY;
    
    for (const msg of toShow) {
      if (y > endY) break;
      
      term.moveTo(1, y);
      if (msg.role === 'user') {
        term.cyan.bold('> ');
        term.white(msg.content.slice(0, term.width - 3));
        y++;
      } else if (msg.role === 'assistant') {
        const lines = this.wrap(msg.content, term.width - 4);
        for (const line of lines) {
          if (y > endY) break;
          term.moveTo(3, y);
          term.white(line);
          y++;
        }
      }
    }
  }

  private wrap(text: string, width: number): string[] {
    if (!text) return [];
    const lines: string[] = [];
    let current = '';
    
    for (const word of text.split(' ')) {
      if ((current + word).length > width) {
        lines.push(current.trim());
        current = word + ' ';
      } else {
        current += word + ' ';
      }
    }
    if (current.trim()) lines.push(current.trim());
    return lines.length ? lines : [text.slice(0, width)];
  }

  private drawInput() {
    const y = term.height - 1;
    term.moveTo(1, y);
    term.eraseLine();
    term.cyan.bold('> ');
    term.white(this.inputBuffer);
    term.moveTo(3 + this.cursorPos, y);
  }

  private drawStatus() {
    const y = term.height;
    term.moveTo(1, y);
    term.eraseLine();
    
    if (this.isProcessing) {
      const frames = ['|', '/', '-', '\\'];
      term.cyan(frames[this.spinnerFrame] + ' ');
      term.gray('thinking...');
    } else {
      term.gray.dim('ready');
    }
    
    // Tokens
    const tokens = Math.round(this.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    const tokenText = `${tokens}t`;
    term.moveTo(term.width - tokenText.length, y);
    term.gray.dim(tokenText);
  }

  destroy() {
    clearInterval(this.spinnerTimer);
    term('[?25h');
    term.grabInput(false);
  }
}
