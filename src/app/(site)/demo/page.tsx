import { buildDemoIncident } from "../../../product/dossier";
import { getStory } from "../../../story/get";
import { DemoTour } from "./tour";

export const metadata = {
  title: "Product tour: the recovery story",
  description:
    "Watch Brindle trace a changed fact, recover only what is wrong, preserve the rest and prove it. No sign-up.",
};

export default function DemoPage() {
  const story = getStory();
  const a = buildDemoIncident(story, "A", { mode: "APPROVAL", approvedB: false });
  const bPlanned = buildDemoIncident(story, "B", { mode: "APPROVAL", approvedB: false });
  const bDone = buildDemoIncident(story, "B", { mode: "APPROVAL", approvedB: true });
  return <DemoTour a={a} bPlanned={bPlanned} bDone={bDone} computedAt={story.computedAt} />;
}
