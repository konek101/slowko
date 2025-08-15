<script lang="ts">
  import Loader from './components/Loader.svelte';
  let loader: any;
  let appComponent: any = null;
  const appProps = { version: '1.5.2' };
  let loaderDone = false;
  let importError: any = null;

  const phases = {
    start: performance.now(),
    importStart: 0,
    importEnd: 0,
    mount: 0,
    postIdle: 0
  };

  function updateProgress(){
    if(!loader || loaderDone) return;
    let p = 2; // base
    const now = performance.now();
    if(phases.importStart && !phases.importEnd){
      // Time-based growth up to 88% while import pending
      const elapsed = now - phases.importStart; // ms
      const t = Math.min(1, elapsed / 10000); // 10s -> 1
      const eased = 1 - Math.pow(1 - t, 2); // ease-out
      p = 2 + eased * 86; // 2 - 88
    }
    if(phases.importEnd){
      p = Math.max(p, 90);
      if(phases.mount) p = Math.max(p, 95);
      if(phases.postIdle) p = 100;
    }
    // Safety: after 20s without importEnd, drift towards 95 regardless
    if(!phases.importEnd){
      const elapsed = now - phases.start;
      if(elapsed > 20000){
        p = Math.min(95, p + (elapsed-20000)/200); // creep to 95 by +1 every 200ms
      }
    }
    loader.set(p);
  }

  const interval = setInterval(updateProgress, 150);

  async function loadApp(retry = false){
    importError = null;
    if(retry){
      phases.importStart = performance.now();
    } else {
      phases.importStart = performance.now();
    }
    updateProgress();
    try {
      const mod = await import('./App.svelte');
      phases.importEnd = performance.now(); updateProgress();
      appComponent = mod.default;
      await tick();
      phases.mount = performance.now(); updateProgress();
      const idleCb = () => { phases.postIdle = performance.now(); updateProgress(); finalizeIfReady(); };
      if('requestIdleCallback' in window){ (window as any).requestIdleCallback(idleCb, { timeout: 1500 }); }
      else setTimeout(idleCb, 400);
    } catch (e){
      importError = e;
      console.error('App dynamic import failed', e);
      // Allow retry; keep progress at current level
    }
  }

  function finalizeIfReady(){
    if(loader && !loaderDone){
      loader.finalize();
      loaderDone = true;
      clearInterval(interval);
    }
  }

  // Absolute max timeout (e.g., extremely slow parse) -> finalize anyway after 30s
  setTimeout(()=>{ if(!loaderDone) finalizeIfReady(); }, 30000);

  (async ()=>{ loadApp(); })();

  import { tick } from 'svelte';
</script>

{#if appComponent}
  <svelte:component this={appComponent} {...appProps} />
{/if}
{#if !loaderDone}
  <Loader bind:this={loader} on:done={()=> loaderDone = true} />
{/if}
{#if importError}
  <div class="load-error">
    <h2>Problem z ładowaniem</h2>
    <p>Nie udało się załadować aplikacji. Sprawdź połączenie i spróbuj ponownie.</p>
    <button on:click={() => { loadApp(true); }}>Spróbuj ponownie</button>
  </div>
{/if}

<style>
.load-error{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10000;background:#121213;color:#fff;font-family:system-ui,sans-serif;gap:1rem;padding:1.5rem;text-align:center;}
.load-error button{background:#6aaa64;color:#fff;border:none;padding:.65rem 1.2rem;border-radius:6px;font-size:1rem;cursor:pointer;}
.load-error button:hover{filter:brightness(1.1);}
@media (prefers-color-scheme: light){.load-error{background:#fff;color:#222}}
</style>
