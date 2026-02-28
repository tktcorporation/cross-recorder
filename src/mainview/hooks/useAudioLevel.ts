import { useEffect, useRef, useState } from "react";

export function useAudioLevel(analyser: AnalyserNode | null): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    if (!analyser) {
      setLevel(0);
      return;
    }

    bufferRef.current = new Uint8Array(analyser.fftSize);

    const update = () => {
      if (!analyser || !bufferRef.current) return;

      analyser.getByteTimeDomainData(bufferRef.current);

      // Compute RMS level (0..1)
      let sumSquares = 0;
      for (let i = 0; i < bufferRef.current.length; i++) {
        const sample = (bufferRef.current[i]! - 128) / 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / bufferRef.current.length);
      // Clamp to 0..1
      setLevel(Math.min(1, rms * 2));

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [analyser]);

  return level;
}
