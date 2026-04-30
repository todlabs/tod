import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  version: string;
  currentDir: string;
}

const WORDS = ["TOD", "TOOL OF DEV"];
const MAX_LEN = "TOOL OF DEV".length; // 11
const CHAR_INTERVAL = 120; // ms per character
const PAUSE_BETWEEN = 2000; // ms pause after full word shown

function padFrame(text: string): string {
  return text.padEnd(MAX_LEN);
}

export default function Header({ version, currentDir }: HeaderProps) {
  const displayName =
    currentDir.split("\\").pop() || currentDir.split("/").pop();
  const [displayText, setDisplayText] = useState(padFrame("TOD"));
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    async function typewriterCycle() {
      let wordIdx = 0;

      while (!stoppedRef.current) {
        const currentWord = WORDS[wordIdx];
        const nextWord = WORDS[(wordIdx + 1) % WORDS.length];

        // Erase current word char by char (right to left)
        for (let i = currentWord.length; i >= 0; i--) {
          if (stoppedRef.current) return;
          setDisplayText(padFrame(currentWord.slice(0, i)));
          await sleep(CHAR_INTERVAL);
        }

        // Small pause when empty
        await sleep(200);

        // Type next word char by char (left to right)
        for (let i = 1; i <= nextWord.length; i++) {
          if (stoppedRef.current) return;
          setDisplayText(padFrame(nextWord.slice(0, i)));
          await sleep(CHAR_INTERVAL);
        }

        // Pause on full word
        await sleep(PAUSE_BETWEEN);

        wordIdx = (wordIdx + 1) % WORDS.length;
      }
    }

    const promise = typewriterCycle();

    return () => {
      stoppedRef.current = true;
    };
  }, []);

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text color="white" bold>
        {displayText}
      </Text>
      <Text color="gray">
        {version} ~/{displayName}
      </Text>
    </Box>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
