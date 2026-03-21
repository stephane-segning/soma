import { Link } from "react-router";
import { useAppLayoutContext } from "../../app";

function NotFound(): React.JSX.Element {
	const { activeSpaceId } = useAppLayoutContext();
	return (
		<section className="panel">
			<h1>Not found</h1>
			<p className="muted">This practice route does not exist.</p>
			<Link className="ghost-button" to={`/spaces/${activeSpaceId}/exercises`}>
				Back to practice
			</Link>
		</section>
	);
}

export default NotFound;
