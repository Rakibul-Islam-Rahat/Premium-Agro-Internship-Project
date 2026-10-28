import { useSyncExternalStore } from "react";
import { getState, subscribe } from "./store-core.js";
export { commit, getState, resetDb, subscribe } from "./store-core.js";

// Selectors should return stable references; derive calculated arrays with useMemo inside components.
export const useDb = (selector) => useSyncExternalStore(subscribe, () => selector(getState()), () => selector(getState()));
