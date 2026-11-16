import { useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { saveErrorReport } from "@/lib/feedback/errorReport";

/** Help → Save Diagnostic Report… writes the same report as a crash, without one. */
export function DiagnosticReportMenu() {
	useEffect(
		() =>
			window.electronAPI?.onMenuSaveDiagnosticReport?.(() => {
				void saveErrorReport("menu").then(
					(result) => {
						if (!result.success) return;
						toast.success("Diagnostic report saved", {
							description: result.path.split("/").pop(),
							action: {
								label: "Show in Finder",
								onClick: () =>
									void window.electronAPI?.revealInFolder?.(result.path),
							},
						});
					},
					(error) => toast.error(`Couldn’t save the report: ${String(error)}`),
				);
			}),
		[],
	);
	return null;
}
