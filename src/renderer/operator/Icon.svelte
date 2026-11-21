<script lang="ts">
  type Props = {
    name:
      | 'bible'
      | 'songs'
      | 'media'
      | 'star'
      | 'timer'
      | 'settings'
      | 'text'
      | 'cast'
      | 'palette'
      | 'keys'
      | 'transfer'
      | 'fullscreen';
  };
  let { name }: Props = $props();
</script>

<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
  {#if name === 'bible'}
    <path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" stroke-linejoin="round" />
    <path d="M5 18a2 2 0 0 1 2-2h12M12 7v6M9.5 9.5h5" stroke-linecap="round" />
  {:else if name === 'songs'}
    <path d="M9 18V6l10-2v12" stroke-linejoin="round" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  {:else if name === 'media'}
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 17 5-4 3 2.5 3.5-3.5 5 4.5" stroke-linejoin="round" />
  {:else if name === 'star'}
    <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8L12 4Z" stroke-linejoin="round" />
  {:else if name === 'timer'}
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9v4.5l3 2M9.5 3h5" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'cast'}
    <rect x="3.5" y="5" width="17" height="12" rx="2" />
    <path d="M9 20.5h6M12 17v3.5" stroke-linecap="round" />
    <path d="M8.5 13.5a3.5 3.5 0 0 1 7 0M6 13.5a6 6 0 0 1 12 0" stroke-linecap="round" />
  {:else if name === 'settings'}
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke-linecap="round" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  {:else if name === 'palette'}
    <path d="M3.5 19 8.5 5h1.5l5 14M5.5 13.5h7.5" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="18.5" cy="16.5" r="2.5" />
  {:else if name === 'keys'}
    <rect x="3.5" y="6" width="17" height="12" rx="2" />
    <path d="M7 10h1M11 10h2M16 10h1M8 14h8" stroke-linecap="round" />
  {:else if name === 'transfer'}
    <path
      d="M7 4v14M3.5 14.5 7 18l3.5-3.5M17 20V6M13.5 9.5 17 6l3.5 3.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {:else if name === 'fullscreen'}
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke-linecap="round" stroke-linejoin="round" />
  {:else}
    <path d="M5 6h14M5 11h14M5 16h9" stroke-linecap="round" />
  {/if}
</svg>
