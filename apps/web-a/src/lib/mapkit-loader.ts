// Singleton MapKit JS loader — guarantees the script is only injected once,
// preventing the "Mapkit namespace already exists" warning and the resulting
// prototype-chain mismatch (where constructors return objects that aren't
// recognized as their own type by other parts of MapKit).

const MAPKIT_TOKEN = process.env.NEXT_PUBLIC_MAPKIT_TOKEN || '';
const SCRIPT_ID = 'apple-mapkit-js';
let loadPromise: Promise<void> | null = null;

export function loadMapKit(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.mapkit && window.mapkit.Coordinate) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Another component already injected the tag — wait for its load.
      if (window.mapkit) {
        resolve();
      } else {
        existing.addEventListener('load', () => {
          if (window.mapkit) {
            window.mapkit.init({
              authorizationCallback: (done: (token: string) => void) => done(MAPKIT_TOKEN),
            });
          }
          resolve();
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('MapKit load failed')), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (!window.mapkit) {
        reject(new Error('MapKit failed to attach to window'));
        return;
      }
      window.mapkit.init({
        authorizationCallback: (done: (token: string) => void) => done(MAPKIT_TOKEN),
      });
      resolve();
    };
    script.onerror = () => reject(new Error('MapKit load failed'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
