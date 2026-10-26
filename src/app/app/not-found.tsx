import { LinkButton } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/layout";

export default function NotFound() {
  return (
    <EmptyState
      title="We could not find that"
      action={<LinkButton href="/app/incidents">Back to incidents</LinkButton>}
    >
      It may belong to another workspace, or it may have been removed.
    </EmptyState>
  );
}
