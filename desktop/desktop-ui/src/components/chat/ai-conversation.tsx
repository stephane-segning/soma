import { useEffect, useRef } from "react";
import type { ChatMessage } from "./ai-message";
import { AiMessage } from "./ai-message";

export type AiConversationProps = {
	messages: ChatMessage[];
	autoScroll?: boolean;
	className?: string;
};

export function AiConversation({
	messages,
	autoScroll = true,
	className,
}: AiConversationProps) {
	const endRef = useRef<HTMLDivElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is a deliberate re-run trigger — scrolls to the bottom whenever a new message arrives (while `autoScroll` is on); it isn't read inside the effect body itself.
	useEffect(() => {
		if (autoScroll && endRef.current) {
			endRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages, autoScroll]);

	return (
		<div className={className}>
			<div className="space-y-2">
				{messages.map((message) => (
					<AiMessage key={message.id} message={message} />
				))}
			</div>
			<div ref={endRef} />
		</div>
	);
}
