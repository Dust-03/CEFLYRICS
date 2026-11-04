import type { Slide } from '@shared/state';

// Lo que espera en la vista previa. `vid` existe si viene de la Biblia.
export type PreviewItem = { slide: Slide; vid?: number };
