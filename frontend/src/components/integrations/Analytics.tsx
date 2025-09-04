import { useEffect } from 'react';

function injectScript(src: string, id: string, inner?: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.id = id;
  if (src) s.src = src;
  s.async = true;
  if (inner) s.innerHTML = inner;
  document.head.appendChild(s);
}

export function Analytics() {
  useEffect(() => {
    const GTM_ID = (import.meta as any).env.VITE_GTM_ID as string | undefined;
    const CLARITY_ID = (import.meta as any).env.VITE_CLARITY_ID as string | undefined;
    const VWO_ID = (import.meta as any).env.VITE_VWO_ID as string | undefined;

    // Google Tag Manager
    if (GTM_ID) {
      injectScript('', 'gtm-init', `
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${GTM_ID}');
      `);
    }

    // Microsoft Clarity
    if (CLARITY_ID) {
      injectScript('', 'clarity-init', `
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, 'clarity', 'script', '${CLARITY_ID}');
      `);
    }

    // VWO (Visual Website Optimizer)
    if (VWO_ID) {
      injectScript(`https://dev.visualwebsiteoptimizer.com/j.php?a=${VWO_ID}&u=${encodeURIComponent(location.href)}&f=0`, 'vwo-js');
    }
  }, []);
  return null;
}

