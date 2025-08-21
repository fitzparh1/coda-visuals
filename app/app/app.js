// Read query params, e.g. ?chart=donut&vertical=ecomm&client=american-apparel
const q = new URLSearchParams(location.search);
const chartType  = q.get('chart')    || 'donut';
const vertical   = q.get('vertical') || 'ecomm';
const clientKey  = q.get('client')   || 'american-apparel';

// Build path to config JSON
const cfgPath = `../configs/${chartType}/${vertical}/${clientKey}.json`;

(async function init(){
  const titleEl = document.getElementById('title');
  const subEl   = document.getElementById('subtitle');
  const badgeEl = document.getElementById('badge');

  try {
    const res = await fetch(cfgPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Config not found: ${cfgPath}`);
    const cfg = await res.json();

    // Optional UI text from config
    titleEl.textContent = cfg.title || '';
    subEl.textContent   = cfg.subtitle || '';
    if (cfg.badge !== undefined) badgeEl.textContent = String(cfg.badge);

    const ctx = document.getElementById('chart').getContext('2d');

    new Chart(ctx, {
      type: (cfg.type || chartType === 'donut' ? 'doughnut' : chartType),
      data: cfg.data,
      options: cfg.options || { responsive:true, maintainAspectRatio:false }
    });
  } catch (e) {
    document.body.innerHTML = `<div style="padding:20px;font-family:sans-serif">
      <h3>Config error</h3><pre>${e.message}</pre>
      <p>Looked for: <code>${cfgPath}</code></p>
    </div>`;
  }
})();
