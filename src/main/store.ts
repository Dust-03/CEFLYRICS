import { initialState, reduce, type Action, type OnAirState } from '@shared/state';

type Listener = (state: OnAirState) => void;

export class OnAirStore {
  private state = initialState;
  private listeners = new Set<Listener>();

  get current() {
    return this.state;
  }

  dispatch(action: Action) {
    const next = reduce(this.state, action);
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
