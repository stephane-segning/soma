import { Link } from "react-router";
import { useAppLayoutContext } from "../../App";

function NotFound(): React.JSX.Element {
	const { activeSpaceId } = useAppLayoutContext();
	return (
		<section className="panel">
			<h1>Not found</h1>
			<p className="muted">This route does not exist.</p>
			<Link className="ghost-button" to={`/spaces/${activeSpaceId}/exercises`}>
				Back to exercises
			</Link>
		</section>
	);
}

export default NotFound;
