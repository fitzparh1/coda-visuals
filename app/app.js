// Parse ?client=<slug>&chart=<type>
const q = new URLSearchParams(location.search);
const chartType = q.get('chart') || 'donut';            // e.g., donut | line | bar
const clientKey = q.get('client') || 'american-apparel';

// client > chart taxonomy
const cfgPath = `../configs/${clientKey}/${chartType}.json`;

(async function init(){
  const titleEl = document.getElementById('title');
  const subEl   = document.getElementById('subtitle');
  const subWrap = document.querySelector('.sub'); // may not exist

  try {
    const res = await fetch(cfgPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${cfgPath}`);
    const cfg = await res.json();

    // Optional UI text
    if (titleEl) titleEl.textContent = cfg.title || '';

    if (subWrap) {
      const text = (cfg.subtitle ?? '').toString().trim();
      if (subEl && text) {
        subEl.textContent = text;
        subWrap.style.display = '';
      } else {
        subWrap.style.display = 'none';
      }
    }

    // Resolve chart type (donut → Chart.js "doughnut")
    const resolvedType = cfg.type || (chartType === 'donut' ? 'doughnut' : chartType);

    const ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {
      type: resolvedType,
      data: cfg.data, // must be { labels, datasets: [...] }
      options: cfg.options || { responsive: true, maintainAspectRatio: false }
    });
  } catch (e) {
    // show an error box
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div style="padding:12px;margin:12px;border:1px solid #eee;border-radius:8px;font:14px system-ui">
         <b>Config error</b><br>${String(e.message)}
         <div style="color:#6c757d;margin-top:6px">Tried: <code>${cfgPath}</code></div>
       </div>`
    );
    console.error('Config load/render error:', e);
    if (titleEl) titleEl.textContent = 'Error loading chart';
  }
})();
