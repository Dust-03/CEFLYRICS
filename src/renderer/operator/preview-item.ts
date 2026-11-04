import type { Slide } from '@shared/state';

// Lo que espera en la vista previa. `kind` decide qué estilo lleva; `key` identifica lo que está
// al aire dentro de cada panel.
export type PreviewItem = { kind: 'bible' | 'song' | 'text' | 'media'; key?: string; slide: Slide };
