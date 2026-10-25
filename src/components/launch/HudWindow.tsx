import { setToastSink } from "../ui/toast";
import { LaunchWindow } from "./LaunchWindow";

// The bar window is only as big as the bar, so its warnings and errors become
// macOS notifications instead of toasts.
setToastSink((message, variant) => {
	if (variant === "danger" || variant === "warning") {
		window.electronAPI?.hudNotify?.({ message });
	}
});

export default function HudWindow() {
	return <LaunchWindow />;
}
