import { useSyncExternalStore } from "react";
import App from "../App";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function AppIsland({ initialPath }: { initialPath: string }) {
  // Match static HTML first, then initialize once from browser-local state.
  const restoreSavedModel = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return <App key={restoreSavedModel ? "local" : "static"} initialPath={initialPath} restoreSavedModel={restoreSavedModel} />;
}
