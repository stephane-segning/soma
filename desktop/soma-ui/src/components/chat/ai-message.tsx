import type { ReactNode } from "react";
import { Database, MessageCircle, Tool, Zap } from "react-feather";
import { cn } from "../../utils/cn";
import { AiMarkdown } from "./ai-markdown";
import { AiThinking, type AiThinkingProps } from "./ai-thinking";

export type ChatRole = "user" | "assistant" | "tool" | "source";

export type ChatMessage = {
	id: string;
	role: ChatRole;
	content: string;
	thinking?: Omit<AiThinkingProps, "className">;
	heading?: string;
	meta?: string;
};

export type AiMessageProps = {
	message: ChatMessage;
	className?: string;
};

export function AiMessage({ message, className }: AiMessageProps) {
	const icon = getIcon(message.role);

	return (
		<div className={cn("flex gap-3 px-1 py-2", className)}>
			<div className="mt-0.5 text-base-content/60">{icon}</div>
			<div className="flex-1 space-y-2">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-sm capitalize">
						{message.role}
					</span>
					{message.meta ? (
						<span className="text-base-content/60 text-xs">{message.meta}</span>
					) : null}
				</div>
				{message.thinking ? (
					<AiThinking
						{...message.thinking}
						className="border border-base-300/60"
					/>
				) : null}
				{message.content ? (
					<AiMarkdown
						className="prose prose-sm max-w-none"
						content={message.content}
					/>
				) : null}
			</div>
		</div>
	);
}

function getIcon(role: ChatRole): ReactNode {
	switch (role) {
		case "assistant":
			return <Zap size={18} />;
		case "tool":
			return <Tool size={18} />;
		case "source":
			return <Database size={18} />;
		case "user":
		default:
			return <MessageCircle size={18} />;
	}
}
