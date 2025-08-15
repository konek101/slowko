<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  const dispatch = createEventDispatcher();
  export let minTime = 600; // minimum ms visible
  let progress = 0;
  let startTime = 0;
  let done = false;
  let visible = true;

  onMount(()=>{ startTime = performance.now(); });

  export function set(p: number){
    if(done) return;
    progress = Math.max(0, Math.min(100, p));
    if(progress >= 100) finalize();
  }

  export function finalize(){
    if(done) return;
    done = true;
    progress = 100;
    // Ensure min display time
    const wait = Math.max(0, minTime - (performance.now()-startTime));
    setTimeout(()=>{ document.body.classList.add('loaded'); visible = false; dispatch('done'); }, wait + 150);
  }
</script>

{#if visible}
<div class="loader" role="status" aria-live="polite">
  <h1>Słówko</h1>
  <div class="bar" aria-label="Postęp ładowania">
    <div class="fill" style={`width:${progress}%`}></div>
  </div>
  <div class="percent">{Math.round(progress)}%</div>
  <div class="tip">Ładowanie zasobów gry… Pierwsze uruchomienie może potrwać kilka sekund.</div>
</div>
{/if}

<style>
.loader{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#121213;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif;z-index:9999;transition:opacity .55s ease .15s;}
.loader:not(:hover){cursor:progress;}
.loader h1{font-size:2rem;margin:0 0 1.2rem;font-weight:600;letter-spacing:.05em;}
.bar{width:min(420px,80%);height:14px;background:#2d2d2d;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px #3a3a3c,0 2px 6px -2px #000;}
.fill{height:100%;background:linear-gradient(90deg,#6aaa64,#85c07d);transition:width .25s ease;}
.percent{margin-top:.75rem;font-size:.9rem;opacity:.85;}
.tip{margin-top:1.15rem;font-size:.75rem;max-width:420px;text-align:center;line-height:1.25;opacity:.62;}
:global(body.loaded) .loader{opacity:0;pointer-events:none;}
@media (prefers-color-scheme: light){
  .loader{background:#fff;color:#222}
  .bar{background:#e5e5e5;box-shadow:0 0 0 1px #d0d0d0,0 2px 6px -2px #0002;}
  .fill{background:linear-gradient(90deg,#6aaa64,#4ea04a);}
}
</style>
