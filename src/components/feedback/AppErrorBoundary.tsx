import { Component, type ErrorInfo, Fragment, type ReactNode } from "react";
import { toReportableError, type ReportableError } from "@/lib/feedback/errorReport";
import { BarCrashScreen, CrashScreen } from "./CrashScreen";

/** How much room a window has for its crash screen. */
export type CrashScreenSize = "full" | "panel" | "bar" | "bubble" | "none";

export function crashScreenSizeFor(windowType: string): CrashScreenSize {
	switch (windowType) {
		case "hud-overlay":
		case "recording-controls":
			return "bar";
		case "webcam-bubble":
			return "bubble";
		case "capture-picker":
		case "source-selector":
		case "permission-accessory":
			return "panel";
		// A countdown or update notice that fails just goes away; its own timers carry on.
		case "countdown":
		case "update-toast":
			return "none";
		default:
			return "full";
	}
}

type Props = { windowType: string; children: ReactNode };
type State = { error: ReportableError | null; attempt: number };

/** Shows a calm crash screen instead of a blank window when part of the app fails. */
export class AppErrorBoundary extends Component<Props, State> {
	state: State = { error: null, attempt: 0 };

	static getDerivedStateFromError(error: unknown): Partial<State> {
		return { error: toReportableError(error) };
	}

	componentDidCatch(error: unknown, info: ErrorInfo) {
		this.setState({ error: toReportableError(error, info.componentStack) });
		console.error(`[SuperShare] The ${this.props.windowType || "app"} window failed:`, error);
		if (this.props.windowType === "update-toast")
			void window.electronAPI?.dismissUpdateToast?.();
	}

	retry = () => this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));

	render() {
		const { error, attempt } = this.state;
		const { windowType } = this.props;
		// A new key remounts the window's content from scratch on Try again.
		if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>;
		const size = crashScreenSizeFor(windowType);
		if (size === "none") return null;
		if (size === "bar" || size === "bubble")
			return (
				<BarCrashScreen
					error={error}
					windowType={windowType}
					onRetry={this.retry}
					bubble={size === "bubble"}
				/>
			);
		return (
			<CrashScreen
				error={error}
				windowType={windowType}
				onRetry={this.retry}
				panel={size === "panel"}
			/>
		);
	}
}
