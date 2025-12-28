import { motion } from "motion/react";

export function AuroraWallpaper() {
	return (
		<div className="absolute inset-0 overflow-hidden">
			<div className="absolute inset-0 bg-gradient-to-br from-base-200 via-base-300/40 to-base-100" />
			<div className="wallpaper-grid absolute inset-0 opacity-40" />
			<motion.div
				animate={{ rotate: 360 }}
				className="absolute top-10 -left-20 h-80 w-80 rounded-full bg-primary/20 blur-3xl"
				transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
			/>
			<motion.div
				animate={{ rotate: -360 }}
				className="absolute right-[-10%] bottom-[-10%] h-96 w-96 rounded-full bg-secondary/25 blur-3xl"
				transition={{ repeat: Infinity, duration: 50, ease: "linear" }}
			/>
		</div>
	);
}
