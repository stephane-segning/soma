import { useEffect, useRef } from "react";
import type { ChatMessage } from "./ai-message";
import { AiMessage } from "./ai-message";

export type AiConversationProps = {
	messages: ChatMessage[];
	autoScroll?: boolean;
	className?: string;
};

export function AiConversation({ messages, autoScroll = true, className }: AiConversationProps) {
	const endRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (autoScroll && endRef.current) {
			endRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages, autoScroll]);

	return (
		<div className={className}>
			<div className="space-y-3">
				{messages.map((message) => (
					<AiMessage key={message.id} message={message} />
				))}
			</div>
			<div ref={endRef} />
		</div>
	);
}
