import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeSvgProps {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
}

export function BarcodeSvg({
  value,
  height = 36,
  width = 1.4,
  fontSize = 11,
  displayValue = true,
  className = '',
}: BarcodeSvgProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,
        height,
        fontSize,
        displayValue,
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      // Fallback if unsupported characters
    }
  }, [value, height, width, fontSize, displayValue]);

  return <svg ref={svgRef} className={className} />;
}
