import React from 'react';
import { Box, Text } from 'ink';

// Inline parser: **bold**, *italic*, `code`
function parseInline(text: string, baseKey: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<Text key={`${baseKey}-p${i++}`}>{text.slice(last, match.index)}</Text>);
    }
    if (match[1]) {
      parts.push(<Text key={`${baseKey}-b${i++}`} bold>{match[2]}</Text>);
    } else if (match[3]) {
      parts.push(<Text key={`${baseKey}-i${i++}`} dimColor>{match[4]}</Text>);
    } else if (match[5]) {
      parts.push(<Text key={`${baseKey}-c${i++}`} color="green">{match[6]}</Text>);
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(<Text key={`${baseKey}-p${i++}`}>{text.slice(last)}</Text>);
  }

  if (parts.length === 0) return <Text>{text}</Text>;
  if (parts.length === 1) return parts[0];
  return <>{parts}</>;
}

interface MarkdownTextProps {
  children: string;
  color?: string;
  dimColor?: boolean;
}

export default function MarkdownText({ children, color, dimColor }: MarkdownTextProps) {
  const lines = children.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.replace(/^`+/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <Box key={`code-${i}`} flexDirection="column" marginY={0} paddingLeft={1} borderStyle="single" borderColor="gray">
          {lang ? <Text color="gray" dimColor>{lang}</Text> : null}
          {codeLines.map((cl, ci) => (
            <Text key={ci} color="green">{cl}</Text>
          ))}
        </Box>
      );
      i++;
      continue;
    }

    // H1
    if (/^#\s/.test(line)) {
      elements.push(
        <Box key={`h1-${i}`}>
          <Text bold color="cyan">{line.replace(/^#\s/, '')}</Text>
        </Box>
      );
      i++;
      continue;
    }

    // H2
    if (/^##\s/.test(line)) {
      elements.push(
        <Box key={`h2-${i}`}>
          <Text bold color="white">{line.replace(/^##\s/, '')}</Text>
        </Box>
      );
      i++;
      continue;
    }

    // H3
    if (/^###\s/.test(line)) {
      elements.push(
        <Box key={`h3-${i}`}>
          <Text bold dimColor>{line.replace(/^###\s/, '')}</Text>
        </Box>
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      elements.push(
        <Box key={`bq-${i}`} paddingLeft={1} borderLeft={true} borderStyle="single" borderColor="gray">
          <Text color="gray">{line.replace(/^>\s?/, '')}</Text>
        </Box>
      );
      i++;
      continue;
    }

    // List item (- or * or numbered)
    if (/^(\s*[-*]|\s*\d+\.)\s/.test(line)) {
      const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;
      const content = line.replace(/^\s*[-*\d.]+\s/, '');
      elements.push(
        <Box key={`li-${i}`} paddingLeft={indent}>
          <Text color="gray">• </Text>
          <Text>{parseInline(content, `li-${i}`)}</Text>
        </Box>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-_*]{3,}$/.test(line.trim())) {
      elements.push(
        <Box key={`hr-${i}`}>
          <Text color="gray" dimColor>{'─'.repeat(40)}</Text>
        </Box>
      );
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<Box key={`br-${i}`} marginTop={0}><Text> </Text></Box>);
      i++;
      continue;
    }

    // Regular paragraph with inline formatting
    elements.push(
      <Box key={`p-${i}`}>
        <Text color={color} dimColor={dimColor}>{parseInline(line, `p-${i}`)}</Text>
      </Box>
    );
    i++;
  }

  return <Box flexDirection="column">{elements}</Box>;
}
