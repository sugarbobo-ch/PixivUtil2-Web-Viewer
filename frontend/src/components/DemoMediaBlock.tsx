import type { CSSProperties, FC } from 'react';
import { normalizeDominantColor } from '../utils/webConfig';

interface DemoMediaBlockProps {
  dominantColor?: string;
  className?: string;
}

export const DemoMediaBlock: FC<DemoMediaBlockProps> = ({
  dominantColor,
  className,
}) => {
  const color = normalizeDominantColor(dominantColor);
  const style = color
    ? { '--demo-media-color': color } as CSSProperties
    : undefined;

  return (
    <span
      className={['demo-media-block', className].filter(Boolean).join(' ')}
      style={style}
      data-demo-media-block="true"
      aria-hidden="true"
    />
  );
};
