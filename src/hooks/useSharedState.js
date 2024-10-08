/* eslint-disable max-classes-per-file */
import { useEffect, useState } from 'react';

export class SharedState {
  constructor(initialValue) {
    this.value = initialValue;
    this.watchers = [];
  }

  watch(watcher) {
    this.watchers.push(watcher);
  }

  removeWatcher(watcher) {
    const index = this.watchers.indexOf(watcher);
    this.watchers.splice(index, 1);
  }

  setValue(newValue) {
    this.value = newValue;
    // eslint-disable-next-line no-restricted-syntax
    for (const watcher of this.watchers) {
      watcher(newValue);
    }
  }
}

export const saveFailedState = new SharedState(false);

const unloadWarning = (e) => {
  const msg = 'WARNING: Changes could not be saved to your browser\'s local storage. '
      + 'Click "cancel" and export your holdings using the buttons at the top of the page or you WILL lose your work.';
  (e || window.event).returnValue = msg; // Gecko + IE
  return msg; // Gecko + Webkit, Safari, Chrome etc.
};
let unloadWarningSet = false;

saveFailedState.watch((failed) => {
  if (failed && !unloadWarningSet) {
    window.addEventListener('beforeunload', unloadWarning);
    unloadWarningSet = true;
  } else if (!failed && unloadWarningSet) {
    // eslint-disable-next-line no-use-before-define
    clearUnloadWarning();
  }
});

export function clearUnloadWarning() {
  window.removeEventListener('beforeunload', unloadWarning);
  unloadWarningSet = false;
}

export function notifySaveFailed() {
  saveFailedState.setValue(true);
}

export function notifySaveSucceeded() {
  saveFailedState.setValue(false);
}

export class SharedPersistedState extends SharedState {
  constructor(localStorageKey, initialValue) {
    const persistedJson = window.localStorage.getItem(localStorageKey);
    const persistedData = persistedJson === null ? initialValue : JSON.parse(persistedJson);
    super(persistedData);
    // https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem#exceptions
    this.watch((s) => {
      try {
        window.localStorage.setItem(localStorageKey, JSON.stringify(s));
        notifySaveSucceeded();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Saving to local storage failed:');
        // eslint-disable-next-line no-console
        console.error(e);
        notifySaveFailed();
      }
    });
  }
}

export function useSharedState(sharedState) {
  const [value, setValue] = useState(sharedState.value);
  useEffect(() => {
    sharedState.watch(setValue);
    return () => sharedState.removeWatcher(setValue);
  }, [sharedState]);
  return [value, (newValue) => sharedState.setValue(newValue)];
}
