const q = new URLSearchParams(location.search);
const chartType = q.get('chart') || 'donut';
const clientKey = q.get('client') || 'american-apparel';

// Client > chartType taxonomy:
const cfgPath = `../configs/${clientKey}/${chartType}.json`;

(async function init(){
  const titleEl = document.getElementById('title');
  const subEl   = document.getElementById('subtitle');
  const badgeEl = document.getElementById('badge');

  try {
    console.log('Fetching config:', cfgPath);
    const res = await fetch(cfgPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${cfgPath}`);
    const cfg = await res.json();
    console.log('Loaded config:', cfg);

    titleEl.textContent = cfg.title || '';
    if (cfg.badge !== undefined) badgeEl.textContent = String(cfg.badge);

    const ctx = document.getElementById('chart').getContext('2d');
    const resolvedType = cfg.type || (chartType === 'donut' ? 'doughnut' : chartType);

    new Chart(ctx, {
      type: resolvedType,
      data: cfg.data,
      options: cfg.options || { responsive: true, maintainAspectRatio: false }
    });
  } catch (e) {
    console.error('Config load/render error:', e);
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div style="padding:12px;margin:12px;border:1px solid #eee;border-radius:8px;font:14px/1.4 system-ui">
         <b>Config error</b><br>${String(e.message)}
         <div style="color:#6c757d;margin-top:6px">Tried: <code>${cfgPath}</code></div>
       </div>`
    );
  }
})();
