// Parse ?client=<slug>&chart=<type>
const q = new URLSearchParams(location.search);
const chartType = q.get('chart') || 'donut';            // e.g., donut | line | bar | matrix
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

// ---- helper: revive "function(...) { ... }" strings in JSON into real functions ----
function reviveFunctions(input) {
  if (Array.isArray(input)) return input.map(reviveFunctions);
  if (input && typeof input === 'object') {
    for (const k of Object.keys(input)) input[k] = reviveFunctions(input[k]);
    return input;
  }
  if (typeof input === 'string') {
    const s = input.trim();
    if (s.startsWith('function')) {
      try { return eval(`(${s})`); } catch { /* leave as-is on error */ }
    }
  }
  return input;
}

// ------------------------------------------------

(async function init(){
  const subEl   = document.getElementById('subtitle');
  const subWrap = document.querySelector('.sub'); // may not exist
  let chart;                                      // keep a ref so we can resize/update

  try {
    const res = await fetch(cfgPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${cfgPath}`);
    // Parse JSON then revive any function strings (for matrix scriptables, tooltip callbacks, etc.)
    let cfg = await res.json();
    cfg = reviveFunctions(cfg);

    // Optional subtitle
    if (subWrap) {
      const text = (cfg.subtitle ?? '').toString().trim();
      if (subEl && text) { subEl.textContent = text; subWrap.style.display = ''; }
      else { subWrap.style.display = 'none'; }
    }

    // Resolve chart type (donut → Chart.js "doughnut")
    const resolvedType = cfg.type || (chartType === 'donut' ? 'doughnut' : chartType);

    // If type is matrix and width/height/background are not provided, give sensible defaults
    if (resolvedType === 'matrix' && Array.isArray(cfg.data?.datasets)) {
      for (const ds of cfg.data.datasets) {
        // width/height to size each cell into its category bucket (with a small gap)
        if (typeof ds.width !== 'function') {
          ds.width = function(ctx) {
            const x = ctx.chart.scales.x;
            const w = Math.abs(x.getPixelForTick(1) - x.getPixelForTick(0));
            return Math.max(4, w - 4);
          };
        }
        if (typeof ds.height !== 'function') {
          ds.height = function(ctx) {
            const y = ctx.chart.scales.y;
            const h = Math.abs(y.getPixelForTick(1) - y.getPixelForTick(0));
            return Math.max(4, h - 4);
          };
        }
        // very basic green-red heat if none provided
        if (typeof ds.backgroundColor !== 'function') {
          ds.backgroundColor = function(ctx) {
            const v = Number(ctx.raw?.v ?? 0);
            // map [-100..100] to 0..1
            const t = Math.max(0, Math.min(1, (v + 100) / 200));
            // simple lerp red → yellow → green
            function lerp(a,b,t){ return Math.round(a + (b-a)*t); }
            let r,g,b;
            if (t < 0.5) { // red -> yellow
              const k = t / 0.5;
              r = 255;
              g = lerp(0, 255, k);
              b = 0;
            } else { // yellow -> green
              const k = (t - 0.5) / 0.5;
              r = lerp(255, 0, k);
              g = 255;
              b = 0;
            }
            return `rgb(${r},${g},${b})`;
          };
        }
      }
    }

    // Build the chart
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type: resolvedType,
      data: cfg.data, // must be { labels, datasets: [...] } or matrix data objects
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
