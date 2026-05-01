import React, { useState, useEffect } from "react";
import { Text } from "ink";

interface WorkingIndicatorProps {
  status?: string;
  enableAnimation?: boolean;
}

export default function WorkingIndicator({ status, enableAnimation = true }: WorkingIndicatorProps) {
  const [frame, setFrame] = useState(0);

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    const iv = setInterval(() => setFrame((f) => (f + 1) % frames.length), 80);
    return () => clearInterval(iv);
  }, []);

  return (
    <Text color="white">
      {frames[frame]} {status || "working"}
    </Text>
  );
}
