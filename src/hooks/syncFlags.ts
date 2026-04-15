// Module partagé : flag pour distinguer les mises à jour distantes
// des actions locales de l'apprenant.
// Utilisé par useSyncReceiver (qui le lève) et useLearnerActionPublisher (qui le consulte).

let _isRemoteUpdate = false;

export function markRemoteUpdate(fn: () => void) {
  _isRemoteUpdate = true;
  try { fn(); } finally { _isRemoteUpdate = false; }
}

export function isRemoteUpdate(): boolean {
  return _isRemoteUpdate;
}
