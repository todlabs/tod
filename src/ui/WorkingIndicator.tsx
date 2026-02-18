import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface WorkingIndicatorProps {
  status?: string;
}

export default function WorkingIndicator({ status }: WorkingIndicatorProps) {
  const [diamondIndex, setDiamondIndex] = useState(0);
  const [dotsIndex, setDotsIndex] = useState(0);
  
  const diamonds = ['◆', '◇'];
  const dotPatterns = ['...', '..', '.'];

  useEffect(() => {
    const diamondInterval = setInterval(() => {
      setDiamondIndex((prev) => (prev + 1) % diamonds.length);
    }, 500); // Меняется каждые 500ms

    return () => clearInterval(diamondInterval);
  }, []);

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDotsIndex((prev) => (prev + 1) % dotPatterns.length);
    }, 400); // Меняется каждые 400ms

    return () => clearInterval(dotsInterval);
  }, []);

  return (
    <Text color="cyan">
      {diamonds[diamondIndex]} Working{dotPatterns[dotsIndex]}
    </Text>
  );
}
