import { useEffect, useRef } from 'react';

declare global { interface Window { hbspt?: any } }

function loadScript(src: string, id: string) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script'); s.id = id; s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('hubspot load failed'));
    document.body.appendChild(s);
  });
}

export function HubSpotForm({ portalId, formId }: { portalId?: string; formId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pid = portalId || (import.meta as any).env.VITE_HUBSPOT_PORTAL_ID;
    const fid = formId || (import.meta as any).env.VITE_HUBSPOT_FORM_ID;
    if (!pid || !fid) return;
    loadScript('https://js.hsforms.net/forms/embed/v2.js', 'hubspot-forms').then(() => {
      if (!window.hbspt || !containerRef.current) return;
      window.hbspt.forms.create({
        region: 'na1',
        portalId: pid,
        formId: fid,
        target: `#hs-form-${fid}`
      });
    }).catch(()=>{});
  }, [portalId, formId]);
  const id = `hs-form-${formId || 'default'}`;
  return <div id={id} ref={containerRef} />;
}

