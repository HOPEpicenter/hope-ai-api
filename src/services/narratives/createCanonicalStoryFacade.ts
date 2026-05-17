import { adaptCanonicalStoryConsumerSnapshot } from "./adaptCanonicalStoryConsumerSnapshot";
import { buildCanonicalStoryView } from "./buildCanonicalStoryView";
import { consumeCanonicalStoryView } from "./consumeCanonicalStoryView";
import type { CanonicalStoryAdapterPayload } from "./adaptCanonicalStoryConsumerSnapshot";
import type { CanonicalStoryConsumerSnapshot } from "./consumeCanonicalStoryView";
import type {
  BuildCanonicalStoryViewInput,
  CanonicalStoryView
} from "./buildCanonicalStoryView";

export type CanonicalStoryFacade = {
  view: CanonicalStoryView;
  snapshot: CanonicalStoryConsumerSnapshot;
  adapter: CanonicalStoryAdapterPayload;
};

export function createCanonicalStoryFacade(input: BuildCanonicalStoryViewInput): CanonicalStoryFacade {
  const view = buildCanonicalStoryView(input);
  const snapshot = consumeCanonicalStoryView(view);

  return {
    view,
    snapshot,
    adapter: adaptCanonicalStoryConsumerSnapshot(snapshot)
  };
}