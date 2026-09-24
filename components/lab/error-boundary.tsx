'use client';
import { Component, type ReactNode } from 'react';
import { Orbit, RotateCcw } from 'lucide-react';
import { clearStored } from './persistence';
/** Leaves the laboratory with a clean address bar and stored configuration. */
function restart(bench: boolean) {
  clearStored({ bench });
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search,
  );
  window.location.reload();
}
/**
 * Last line of defense for rendering failures. A crafted link or file that
 * slips past validation would otherwise blank the page on every reload, so
 * recovery removes the link and the stored configuration.
 */
export class LaboratoryErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="crash-screen" role="alert">
        <Orbit size={36} />
        <span className="eyebrow">THE LABORATORY STOPPED</span>
        <h1>This universe could not be displayed.</h1>
        <p>
          A shared link, an imported file or data saved in this browser produced
          a state the interface cannot draw. Resetting removes the link and the
          saved configuration; the comparison bench is kept unless you clear it
          as well.
        </p>
        <pre>{error.message}</pre>
        <div className="crash-actions">
          <button className="run-button" onClick={() => restart(false)}>
            <RotateCcw size={16} /> Reset to the reference universe
          </button>
          <button className="text-button" onClick={() => restart(true)}>
            Also clear the comparison bench
          </button>
        </div>
      </main>
    );
  }
}
