<script lang="ts">
  import { createRenderer, type RenderState } from '@render-engine/index';

  type Props = { id: string; state: RenderState };
  let { id, state: renderState }: Props = $props();

  let stage = $state<HTMLElement>();

  // Las vistas de la consola usan el mismo motor que las salidas.
  $effect(() => {
    if (!stage) return;
    const render = createRenderer(stage);
    $effect(() => render(renderState));
  });
</script>

<div class="screen"><div {id} bind:this={stage}></div></div>

<style>
  .screen {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #000;
    border-radius: 8px;
  }
</style>
