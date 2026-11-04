<script lang="ts">
  import { createRenderer, type RenderState } from '@render-engine/index';

  type Props = { id: string; state: RenderState; aspect?: string; now?: () => number };
  let { id, state: renderState, aspect = '16 / 9', now }: Props = $props();

  let stage = $state<HTMLElement>();

  // Las vistas de la consola usan el mismo motor que las salidas.
  $effect(() => {
    if (!stage) return;
    const render = createRenderer(stage, { playback: false, now });
    $effect(() => render(renderState));
  });
</script>

<div class="screen" style:aspect-ratio={aspect}><div {id} bind:this={stage}></div></div>

<style>
  .screen {
    position: relative;
    overflow: hidden;
    background: #000;
    border-radius: 8px;
  }
</style>
