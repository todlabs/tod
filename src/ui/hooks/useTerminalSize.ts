import { useState, useEffect, useRef } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
  columns: number;
  rows: number;
}

/**
 * Returns current terminal dimensions and re-renders on resize.
 * Falls back to 80x24 if stdout is not available.
 *
 * On resize, the visible screen is cleared (scrollback preserved) after
 * a short debounce so Ink can redraw cleanly without ghost/duplicate content.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!stdout) return;

    const onResize = () => {
      // Update size immediately so layout adapts
      setSize({
        columns: stdout.columns ?? 80,
        rows: stdout.rows ?? 24,
      });

      // Debounce the screen clear: wait until the user stops resizing,
      // then wipe the visible area (preserve scrollback) so Ink redraws
      // cleanly without ghost lines from the old width.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Move cursor home + clear to end of screen (no scrollback erase)
        process.stdout.write("\x1b[H\x1b[J");
        // Force another render after clear so Ink repaints on the clean slate
        setSize({
          columns: stdout.columns ?? 80,
          rows: stdout.rows ?? 24,
        });
        timerRef.current = null;
      }, 120);
    };

    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stdout]);

  return size;
}
