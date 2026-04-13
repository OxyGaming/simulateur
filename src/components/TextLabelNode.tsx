'use client';
import { useRef, useEffect, useState } from 'react';
import { TextLabel } from '@/types/railway';

// ─── Pure render component ────────────────────────────────────────────────────

interface Props {
  label: TextLabel;
  isSelected: boolean;
  cursor: React.CSSProperties['cursor'];
  onMouseDown: (e: React.MouseEvent<SVGGElement>) => void;
  onClick:     (e: React.MouseEvent<SVGGElement>) => void;
}

export function TextLabelNode({ label, isSelected, cursor, onMouseDown, onClick }: Props) {
  const textRef = useRef<SVGTextElement>(null);
  const [bbox, setBbox] = useState({ w: 60, h: label.fontSize });

  // Measure the rendered text so the selection rect fits exactly.
  useEffect(() => {
    if (!textRef.current) return;
    try {
      const b = textRef.current.getBBox();
      setBbox({ w: b.width, h: b.height });
    } catch {
      // getBBox can throw in some server-side contexts — keep default
    }
  }, [label.text, label.fontSize]);

  // Text baseline is at label.y; the box extends upward by ~fontSize.
  const padX = 4;
  const padY = 3;

  return (
    <g onMouseDown={onMouseDown} onClick={onClick} style={{ cursor }}>
      {/* Transparent hitbox — covers the text bounding box so clicks register on the <g> */}
      <rect
        x={label.x - padX}
        y={label.y - bbox.h - padY}
        width={bbox.w + padX * 2}
        height={bbox.h + padY * 2}
        fill="transparent"
        rx={3}
      />

      {/* Selection border */}
      {isSelected && (
        <rect
          x={label.x - padX}
          y={label.y - bbox.h - padY}
          width={bbox.w + padX * 2}
          height={bbox.h + padY * 2}
          fill="rgba(74,144,217,0.08)"
          stroke="#4a90d9"
          strokeWidth={1}
          strokeDasharray="4,3"
          rx={3}
          pointerEvents="none"
        />
      )}

      {/* The text */}
      <text
        ref={textRef}
        x={label.x}
        y={label.y}
        fill="white"
        fontSize={label.fontSize}
        fontFamily="monospace"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {label.text}
      </text>
    </g>
  );
}
