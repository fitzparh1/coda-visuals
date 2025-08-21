// Parse ?client=<slug>&chart=<type>
const q = new URLSearchParams(location.search);
const chartType = q.get('chart') || 'donut';            // e.g., donut | line | bar | crosstab
const clientKey = q.get('client') || 'american-eagle';

// client > chart taxonomy
const cfgPath = `../configs/${clientKey}/${chartType}.json`;

// ---------- responsive height helper ----------
const BOX_RATIO = 4;   // shorter box looks better for 1-row matrix
const MIN_HEIGHT = 260;
const boxEl = document.querySelector('.box');

function fitBoxHeight() {
  if (!boxEl) return;
  const w = boxEl.clientWidth || 0;
  const h = Math.max(MIN_HEIGHT, Math.round(w / BOX_RATIO));
  boxEl.style.height = h + 'px';
}

new ResizeObserver(fitBoxHeight).observe(boxEl);
window.addEventListener('load', fitBoxHeight);

// ---- Register optional plugins if present (safe no-ops if missing) ----
if (window.ChartDataLabels && Chart?.register) {
  Chart.register(window.ChartDataLabels);
}

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

// ---- helpers for matrix safe access / shims ----
function getPoint(ds, i) { return (ds && Array.isArray(ds.data)) ? ds.data[i] : undefined; }
function getV(ds, i) { const p = getPoint(ds, i); return Number((p && (p.v ?? p.value)) ?? 0); }
function getX(ds, i) { const p = getPoint(ds, i); return (p && p.x) ?? ''; }
function getY(ds, i) { const p = getPoint(ds, i); return (p && p.y) ?? ''; }

function withRawShim(fn, makeRaw) {
  if (typeof fn !== 'function') return fn;
  // Return a wrapper that injects ctx.raw (or items[0].raw for tooltip)
  return function wrapped(ctxOrItems) {
    try {
      // datalabels/backgroundColor/callbacks receive (ctx)
      if (ctxOrItems && ctxOrItems.dataIndex != null) {
        const ctx = ctxOrItems;
        const ds = ctx.dataset || (ctx.chart?.data?.datasets?.[ctx.datasetIndex]);
        const i  = ctx.dataIndex ?? 0;
        const raw = makeRaw(ds, i);
        return fn({ ...ctx, raw });
      }
      // tooltip callbacks can receive (items) or (ctx)
      if (Array.isArray(ctxOrItems) && ctxOrItems.length) {
        const items = ctxOrItems;
        const i = items[0].dataIndex ?? 0;
        const ds = items[0].dataset;
        const raw = makeRaw(ds, i);
        const patched = [{ ...items[0], raw }];
        return fn(patched);
      }
      // label(ctx) form in tooltip
      if (ctxOrItems && ctxOrItems.dataset) {
        const ctx = ctxOrItems;
        const ds = ctx.dataset;
        const i  = ctx.dataIndex ?? 0;
        const raw = makeRaw(ds, i);
        return fn({ ...ctx, raw });
      }
      return fn(ctxOrItems);
    } catch (e) {
      console.warn('Shimmed callback failed:', e);
      return undefined;
    }
  };
}

// ------------------------------------------------

(async function init(){
  const subEl   = document.getElementById('subtitle');
  const subWrap = document.querySelector('.sub'); // may not exist
  let chart;

  try {
    const res = await fetch(cfgPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${cfgPath}`);

    let cfg = await res.json();
    cfg = reviveFunctions(cfg);

    // Optional subtitle
    if (subWrap) {
      const text = (cfg.subtitle ?? '').toString().trim();
      if (subEl && text) { subEl.textContent = text; subWrap.style.display = ''; }
      else { subWrap.style.display = 'none'; }
    }

    // Resolve chart type (donut → doughnut, crosstab → matrix, bar-chart → bar)
    const TYPE_MAP = { 'donut': 'doughnut', 'crosstab': 'matrix', 'bar-chart': 'bar' };
    const resolvedType = cfg.type || TYPE_MAP[chartType] || chartType;

    // If type is matrix, ensure dataset + callbacks are safe even when JSON assumes ctx.raw
    if (resolvedType === 'matrix' && Array.isArray(cfg.data?.datasets)) {
      for (const ds of cfg.data.datasets) {
        // Explicit parsing keys for {x,y,v}
        if (!ds.parsing || ds.parsing === false) {
          ds.parsing = { xAxisKey: 'x', yAxisKey: 'y', key: 'v' };
        }

        // width/height to size each cell into its category bucket (with a small gap)
        if (typeof ds.width !== 'function') {
          ds.width = function(ctx) {
            const x = ctx.chart.scales.x;
            const tick0 = x.getPixelForTick(0);
            const tick1 = x.getPixelForTick(Math.min(1, x.ticks.length - 1));
            const w = Math.abs(tick1 - tick0);
            return Math.max(28, w - 12);
          };
        }
        if (typeof ds.height !== 'function') {
          ds.height = function(ctx) {
            const y = ctx.chart.scales.y;
            const tick0 = y.getPixelForTick(0);
            const tick1 = y.getPixelForTick(Math.min(1, y.ticks.length - 1));
            const h = Math.abs(tick1 - tick0) || 46;  // fallback for single-row case
            return Math.max(24, h - 8);
          };
        }

        // Default heat if none provided (does NOT depend on ctx.raw)
        if (typeof ds.backgroundColor !== 'function') {
          ds.backgroundColor = function(ctx) {
            const v = getV(ctx.dataset, ctx.dataIndex);
            const t = Math.max(0, Math.min(1, (v + 100) / 200)); // [-100..100] → [0..1]
            function lerp(a,b,t){ return Math.round(a + (b-a)*t); }
            let r,g,b;
            if (t < 0.5) { const k = t / 0.5; r = 255; g = lerp(0,255,k); b = 0; }
            else { const k = (t - 0.5) / 0.5; r = lerp(255,0,k); g = 255; b = 0; }
            return `rgb(${r},${g},${b})`;
          };
        } else {
          // If user provided a function that expects ctx.raw.v, inject a safe raw
          const old = ds.backgroundColor;
          ds.backgroundColor = withRawShim(old, (ds,i) => ({ v: getV(ds,i), x: getX(ds,i), y: getY(ds,i) }));
        }

        if (ds.borderWidth == null) ds.borderWidth = 1;
        if (ds.borderColor == null) ds.borderColor = 'rgba(255,255,255,0.75)';
        if (ds.borderRadius == null) ds.borderRadius = 6;
      }

      // Also shim common plugin callbacks that often read ctx.raw.*
      const dl = cfg.options?.plugins?.datalabels;
      if (dl && typeof dl === 'object') {
        if (typeof dl.formatter === 'function') {
          dl.formatter = withRawShim(dl.formatter, (ds,i) => ({ v: getV(ds,i), x: getX(ds,i), y: getY(ds,i) }));
        }
        if (typeof dl.color === 'function') {
          dl.color = withRawShim(dl.color, (ds,i) => ({ v: getV(ds,i), x: getX(ds,i), y: getY(ds,i) }));
        }
        if (typeof dl.backgroundColor === 'function') {
          dl.backgroundColor = withRawShim(dl.backgroundColor, (ds,i) => ({ v: getV(ds,i), x: getX(ds,i), y: getY(ds,i) }));
        }
      }

      const ttip = cfg.options?.plugins?.tooltip?.callbacks;
      if (ttip && typeof ttip === 'object') {
        if (typeof ttip.title === 'function') {
          ttip.title = withRawShim(ttip.title, (ds,i) => ({ v: getV(ds,i), x: getX(ds,i), y: getY(ds,i) }));
        }
        if (typeof ttip.label === 'function') {
          ttip.label = withRawShim(ttip.label, (ds,i) => ({ v: getV(ds,i), x: getX(ds,i), y: getY(ds,i) }));
        }
      }
    }

    // Build the chart
    const ctx = document.getElementById('chart').getContext('2d');
    let options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      ...cfg.options
    };

    const chartConfig = { type: resolvedType, data: cfg.data, options };

    try {
      chart = new Chart(ctx, chartConfig);
    } catch (e) {
      // Surface any init-time errors with path info
      throw new Error(e?.message || String(e));
    }

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
