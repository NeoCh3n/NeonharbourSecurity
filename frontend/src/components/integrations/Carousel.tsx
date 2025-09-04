import { useEffect, useRef } from 'react';

declare global { interface Window { Swiper?: any } }

function loadCss(href: string, id: string) {
  if (document.getElementById(id)) return;
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}
function loadScript(src: string, id: string) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script'); s.id = id; s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('swiper load failed'));
    document.head.appendChild(s);
  });
}

export function Carousel({ slides = [] as React.ReactNode[], height = 180 }: { slides?: React.ReactNode[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadCss('https://unpkg.com/swiper@10/swiper-bundle.min.css', 'swiper-css');
    loadScript('https://unpkg.com/swiper@10/swiper-bundle.min.js', 'swiper-js').then(() => {
      if (!window.Swiper || !ref.current) return;
      // eslint-disable-next-line no-new
      new window.Swiper(ref.current, { loop: true, autoplay: { delay: 3000 }, pagination: { el: '.swiper-pagination' } });
    }).catch(()=>{});
  }, []);

  return (
    <div className="swiper" ref={ref} style={{ height }}>
      <div className="swiper-wrapper">
        {slides.map((s, i) => (<div key={i} className="swiper-slide">{s}</div>))}
      </div>
      <div className="swiper-pagination" />
    </div>
  );
}

