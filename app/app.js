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

    // If type is matrix, ensure dataset settings that the plugin expects
    if (resolvedType === 'matrix' && Array.isArray(cfg.data?.datasets)) {
      for (const ds of cfg.data.datasets) {
        // Required so {x,y,v} objects are passed through and ctx.raw is defined
        if (ds.parsing !== false) ds.parsing = false;

        // width/height to size each cell into its category bucket (with a small gap)
        if (typeof ds.width !== 'function') {
          ds.width = function(ctx) {
            const x = ctx.chart.scales.x;
            const tick0 = x.getPixelForTick(0);
            const tick1 = x.getPixelForTick(Math.min(1, x.ticks.length - 1));
            const w = Math.abs(tick1 - tick0);
            return Math.max(4, w - 4);
          };
        }
        if (typeof ds.height !== 'function') {
          ds.height = function(ctx) {
            const y = ctx.chart.scales.y;
            const tick0 = y.getPixelForTick(0);
            const tick1 = y.getPixelForTick(Math.min(1, y.ticks.length - 1));
            const h = Math.abs(tick1 - tick0);
            return Math.max(4, h - 4);
          };
        }

        // simple red→yellow→green if none provided
        if (typeof ds.backgroundColor !== 'function') {
          ds.backgroundColor = function(ctx) {
            const v = Number(ctx.raw?.v ?? 0);
            const t = Math.max(0, Math.min(1, (v + 100) / 200)); // map [-100..100] → [0..1]
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

        // nice separation between cells (optional)
        if (ds.borderWidth == null) ds.borderWidth = 1;
        if (ds.borderColor == null) ds.borderColor = 'rgba(255,255,255,0.75)';
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
