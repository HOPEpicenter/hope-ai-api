import { createCanonicalStoryFacade } from "./createCanonicalStoryFacade";
import type {
  BuildCanonicalStoryViewInput,
  CanonicalStoryView
} from "./buildCanonicalStoryView";
import type { CanonicalStoryFacade } from "./createCanonicalStoryFacade";

export type CanonicalStoryGatewayPayload = {
  gatewayType: "canonical_story";
  facade: CanonicalStoryFacade;
  view: CanonicalStoryView;
};

export function createCanonicalStoryGateway(
  input: BuildCanonicalStoryViewInput
): CanonicalStoryGatewayPayload {
  const facade = createCanonicalStoryFacade(input);

  return {
    gatewayType: "canonical_story",
    facade,
    view: facade.view
  };
}