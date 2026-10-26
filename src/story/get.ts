import snapshot from "./snapshot.json";
import { STORY_VERSION, type StorySnapshot } from "./types";

/**
 * The committed recording of one real engine run (regenerate with `npm run story:snapshot`).
 * A test re-runs the engine and checks that this recording's facts still hold.
 */
export function getStory(): StorySnapshot {
  const story = snapshot as unknown as StorySnapshot;
  if (story.version !== STORY_VERSION) {
    throw new Error("The recorded story is out of date. Run `npm run story:snapshot`.");
  }
  return story;
}
