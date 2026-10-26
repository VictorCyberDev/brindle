import { writeFileSync } from "node:fs";
import { computeStory, storyDigest } from "../src/story/snapshot";

/** Regenerates src/story/snapshot.json from one real engine run. */
const started = Date.now();
const story = await computeStory();
writeFileSync("src/story/snapshot.json", JSON.stringify(story) + "\n");
console.log(`wrote src/story/snapshot.json in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(storyDigest(story), null, 1));
