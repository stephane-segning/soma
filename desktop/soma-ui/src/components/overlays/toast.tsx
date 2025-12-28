import type { DefaultToastOptions, ToastOptions, ToastPosition } from "react-hot-toast";
import { Toaster, toast } from "react-hot-toast";

const baseToastOptions: DefaultToastOptions = {
	className: "glass-panel shadow-xl text-base-content",
	style: { padding: "12px 14px", borderRadius: "12px" },
	iconTheme: { primary: "#22c55e", secondary: "#fff" },
};

const inlineToastOptions: ToastOptions = {
	className: baseToastOptions.className,
	style: baseToastOptions.style,
	iconTheme: baseToastOptions.iconTheme,
};

export function DesktopToaster({ position }: { position?: ToastPosition }) {
	return <Toaster position={position ?? "bottom-right"} toastOptions={baseToastOptions} />;
}

export const notify = {
	success: (message: string, options?: ToastOptions) => toast.success(message, { ...inlineToastOptions, ...options }),
	error: (message: string, options?: ToastOptions) => toast.error(message, { ...inlineToastOptions, ...options }),
	info: (message: string, options?: ToastOptions) =>
		touchToast(message, { icon: "💡", ...inlineToastOptions, ...options }),
};

function touchToast(message: string, options?: ToastOptions) {
	return toast(message, { ...inlineToastOptions, ...options });
}
