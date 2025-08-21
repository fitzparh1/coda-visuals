// Parse ?client=<slug>&chart=<type>
const q = new URLSearchParams(location.search);
const chartType = q.get('chart') || 'donut';            // e.g., donut | line | bar
const clientKey = q.get('client') || 'american-apparel';

// client > chart taxonomy
const cfgPath = `../configs/${clientKey}/${chartType}.json`;

// ---------- responsive height helper ----------
const BOX_RATIO = 16 / 9;              // change if you like (e.g., 1 for square)
const MIN_HEIGHT = 260;                // prevents tiny embeds from collapsing
const boxEl = document.querySelector('.box');

function fitBoxHeight() {
  if (!boxEl) return;
  const w = boxEl.clientWidth || 0;
  const h = Math.max(MIN_HEIGHT, Math.round(w / BOX_RATIO));
  boxEl.style.height = h + 'px';
}

new ResizeObserver(fitBoxHeight).observe(boxEl);
window.addEventListener('load', fitBoxHeight);

// ------------------------------------------------

(async function init(){
  const subEl   = document.getElementById('subtitle');
  const subWrap = document.querySelector('.sub'); // may not exist
  let chart;                                      // keep a ref so we can resize/update

  try {
    const res = await fetch(cfgPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${cfgPath}`);
    const cfg = await res.json();

    // Optional subtitle
    if (subWrap) {
      const text = (cfg.subtitle ?? '').toString().trim();
      if (subEl && text) { subEl.textContent = text; subWrap.style.display = ''; }
      else { subWrap.style.display = 'none'; }
    }

    // Resolve chart type (donut → Chart.js "doughnut")
    const resolvedType = cfg.type || (chartType === 'donut' ? 'doughnut' : chartType);

    // Build the chart
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: resolvedType,
      data: cfg.data, // must be { labels, datasets: [...] }
      options: {
        responsive: true,
        maintainAspectRatio: false,  // <-- let the .box control height
        animation: false,
        ...cfg.options
      }
    });

    // First layout after chart exists
    fitBoxHeight();
    chart.resize();

    // Optional: adapt legend position for narrow widths
    const adaptLegend = () => {
      if (!chart) return;
      const narrow = (boxEl.clientWidth || 0) < 520;
      const desired = narrow ? 'bottom' : 'right';
      if (chart.options?.plugins?.legend) {
        if (chart.options.plugins.legend.position !== desired) {
          chart.options.plugins.legend.position = desired;
          chart.update('none');
        }
      }
    };

    adaptLegend();
    new ResizeObserver(() => { fitBoxHeight(); chart.resize(); adaptLegend(); }).observe(boxEl);

  } catch (e) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div style="padding:12px;margin:12px;border:1px solid #eee;border-radius:8px;font:14px system-ui">
         <b>Config error</b><br>${String(e.message)}
         <div style="color:#6c757d;margin-top:6px">Tried: <code>${cfgPath}</code></div>
       </div>`
    );
    console.error('Config load/render error:', e);
  }
})();
