import { useEffect, useRef } from 'react';

declare global { interface Window { lottie?: any } }

function loadScript(src: string, id: string) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.id = id; s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('lottie load failed'));
    document.head.appendChild(s);
  });
}

export function LottiePlayer({ src, loop = true, autoplay = true, height = 160 }: { src: string; loop?: boolean; autoplay?: boolean; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let anim: any;
    loadScript('https://unpkg.com/lottie-web/build/player/lottie_light.min.js', 'lottie-web').then(() => {
      if (!window.lottie || !ref.current) return;
      anim = window.lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop, autoplay, path: src });
    }).catch(()=>{});
    return () => { try { anim?.destroy?.(); } catch {} };
  }, [src, loop, autoplay]);
  return <div ref={ref} style={{ height }} />;
}

