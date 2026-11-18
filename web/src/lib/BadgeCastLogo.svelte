<script lang="ts">
  /** BadgeCast mark: a round badge sending out signal arcs. */
  interface Props { size?: number; class?: string }
  let { size = 40, class: klass = '' }: Props = $props()
</script>

<svg width={size} height={size} viewBox="0 0 48 48" class={klass} role="img" aria-label="BadgeCast">
  <defs>
    <linearGradient id="bc-ring" x1="8" y1="40" x2="34" y2="14" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6E27FF" />
      <stop offset="1" stop-color="#00E5FF" />
    </linearGradient>
    <radialGradient id="bc-face" cx="17" cy="24" r="12" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FF1E76" />
      <stop offset="1" stop-color="#6E27FF" />
    </radialGradient>
  </defs>
  <circle cx="20" cy="28" r="13" fill="#0B1020" stroke="url(#bc-ring)" stroke-width="3" />
  <circle cx="20" cy="28" r="7" fill="url(#bc-face)" />
  <g fill="none" stroke="#00E5FF" stroke-width="3" stroke-linecap="round">
    <path d="M24.9 9.6 A19 19 0 0 1 38.4 23.1" />
    <path d="M27.4 5.2 A24 24 0 0 1 42.8 20.6" opacity="0.6" />
  </g>
</svg>
